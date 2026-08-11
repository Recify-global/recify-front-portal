import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoicesPage from '@/pages/InvoicesPage';
import type { BackendInvoice } from '@/types/invoice';
import { ApiRequestError } from '@/api/http';
import { dateRangeForPreset } from '@/utils/financial-kpis';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    token: 'token',
    companyId: mocks.companyId,
  }),
}));

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({
    activeCompany: {
      _id: mocks.companyId ?? 'company-a',
      name: 'Acme',
      timezone: 'America/Mexico_City',
    },
    companies: [],
    allowedIds: ['company-a'],
    hasNames: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/services/invoices.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/invoices.service')>(
    '@/services/invoices.service',
  );
  return {
    ...actual,
    listInvoices: (...args: unknown[]) => mocks.listInvoices(...args),
    getInvoice: (...args: unknown[]) => mocks.getInvoice(...args),
    deleteInvoice: (...args: unknown[]) => mocks.deleteInvoice(...args),
    confirmInvoiceMatch: vi.fn(),
    unlinkInvoiceMatch: vi.fn(),
    updateInvoiceMatchStatus: vi.fn(),
    getInvoiceMatchCandidates: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function invoice(overrides: Partial<BackendInvoice> = {}): BackendInvoice {
  return {
    _id: 'inv-1',
    uuid: '11111111-1111-1111-1111-111111111111',
    type: 'egreso',
    issuerRfc: 'XAXX010101000',
    issuerName: 'Emisor Uno',
    receiverRfc: null,
    receiverName: null,
    date: '2026-07-13T06:00:00.000Z',
    subtotal: 100,
    tax: 16,
    total: 116,
    paymentForm: '03',
    paymentMethod: 'PUE',
    fileUrl: 'https://files.example/1.pdf',
    ticketId: null,
    matchStatus: 'unmatched',
    matchCandidates: [],
    created_at: '2026-07-13T06:00:00.000Z',
    updated_at: '2026-07-13T06:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <InvoicesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  mocks.companyId = 'company-a';
  mocks.listInvoices.mockImplementation(async (_companyId: string, params: { page?: number }) => {
    if (params?.page === 2) {
      return {
        data: [invoice({ _id: 'inv-page-2', issuerName: 'Página Dos' })],
        total: 25,
        page: 2,
        limit: 20,
        pages: 2,
      };
    }
    return {
      data: [
        invoice(),
        invoice({
          _id: 'inv-null-uuid',
          uuid: null,
          issuerName: 'Sin Folio SA',
          issuerRfc: 'AAA010101AAA',
        }),
      ],
      total: 25,
      page: 1,
      limit: 20,
      pages: 2,
    };
  });
  mocks.getInvoice.mockImplementation(async (_c: string, id: string) =>
    invoice({
      _id: id,
      uuid: id === 'inv-null-uuid' ? null : '11111111-1111-1111-1111-111111111111',
      fileUrl: 'https://files.example/fresh.pdf',
    }),
  );
  Object.defineProperty(window, 'open', {
    configurable: true,
    value: mocks.open,
  });
});

afterEach(cleanup);

describe('InvoicesPage inventory and UUID safety', () => {
  it('does not present issuer name or UUID search as a global filter', async () => {
    renderPage();
    expect(await screen.findByText('Emisor Uno')).toBeInTheDocument();
    expect(screen.getByText('Sin Folio SA')).toBeInTheDocument();

    mocks.listInvoices.mockClear();
    fireEvent.change(screen.getByLabelText('RFC del emisor'), {
      target: { value: 'sin folio' },
    });

    expect(screen.getByText('Sin Folio SA')).toBeInTheDocument();
    expect(screen.getByText('Emisor Uno')).toBeInTheDocument();
    expect(screen.getByText(/Ingresa el RFC completo/i)).toBeInTheDocument();
    expect(mocks.listInvoices).not.toHaveBeenCalled();
  });

  it('requests page 2 with server pagination params', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    fireEvent.click(screen.getByLabelText('Go to next page'));
    expect(await screen.findByText('Página Dos')).toBeInTheDocument();
    expect(mocks.listInvoices).toHaveBeenCalledWith(
      'company-a',
      expect.objectContaining({ page: 2, limit: 20 }),
      expect.any(Object),
    );
  });

  it('opens detail with keyboard and shows safe UUID fallback', async () => {
    renderPage();
    const row = await screen.findByRole('button', {
      name: /Abrir factura de Sin Folio SA/i,
    });
    fireEvent.keyDown(row, { key: 'Enter' });

    await waitFor(() => {
      expect(mocks.getInvoice).toHaveBeenCalledWith(
        'company-a',
        'inv-null-uuid',
        expect.any(Object),
      );
    });

    expect(await screen.findByText('Sin folio fiscal')).toBeInTheDocument();
  });

  it('does not query B with invoice id from A after company switch', async () => {
    const { rerender } = renderPage();
    fireEvent.click(await screen.findByText('Emisor Uno'));
    await waitFor(() => expect(mocks.getInvoice).toHaveBeenCalled());
    mocks.getInvoice.mockClear();

    mocks.companyId = 'company-b';
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    rerender(
      <QueryClientProvider client={client}>
        <InvoicesPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mocks.getInvoice).not.toHaveBeenCalledWith(
      'company-b',
      'inv-1',
      expect.anything(),
    );
  });

  it('shows detail error with retry instead of silent success', async () => {
    mocks.getInvoice.mockRejectedValue(new ApiRequestError('missing', 404));
    renderPage();
    fireEvent.click(await screen.findByText('Emisor Uno'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/No encontramos esa factura/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });

  it('refreshes PDF URL before opening and blocks double open while busy', async () => {
    let resolveGet!: (value: BackendInvoice) => void;
    mocks.getInvoice.mockImplementation(
      () =>
        new Promise<BackendInvoice>((resolve) => {
          resolveGet = resolve;
        }),
    );
    mocks.open.mockReturnValue({});

    renderPage();
    await screen.findByText('Emisor Uno');

    const pdfButtons = screen.getAllByLabelText('Abrir PDF');
    fireEvent.click(pdfButtons[0]);
    fireEvent.click(pdfButtons[0]);

    expect(mocks.getInvoice).toHaveBeenCalledTimes(1);

    resolveGet(
      invoice({
        fileUrl: 'https://files.example/refreshed.pdf',
      }),
    );

    await waitFor(() => {
      expect(mocks.open).toHaveBeenCalledWith(
        'https://files.example/refreshed.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('has accessible clear search control', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    fireEvent.change(screen.getByLabelText('RFC del emisor'), { target: { value: 'abc' } });
    expect(screen.getByLabelText('Limpiar búsqueda')).toBeInTheDocument();
  });
});

describe('InvoicesPage filters', () => {
  it('starts with Todo el historial and omits date params', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');

    expect(screen.getByRole('button', { name: 'Todo el historial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.listInvoices).toHaveBeenCalledWith(
      'company-a',
      { page: 1, limit: 20 },
      expect.any(Object),
    );
  });

  it.each([
    ['Hoy', 'today'],
    ['Ayer', 'yesterday'],
    ['7 días', 'last_7_days'],
    ['15 días', 'last_15_days'],
    ['30 días', 'last_30_days'],
    ['60 días', 'last_60_days'],
    ['90 días', 'last_90_days'],
    ['Último año', 'last_12_months'],
  ] as const)('applies the %s preset as civil dates', async (label, preset) => {
    renderPage();
    await screen.findByText('Emisor Uno');
    const expected = dateRangeForPreset(preset, new Date(), 'America/Mexico_City');

    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          page: 1,
          limit: 20,
          dateFrom: expected.dateFrom,
          dateTo: expected.dateTo,
        }),
        expect.any(Object),
      );
    });
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Todo el historial clears an active date range', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Todo el historial' }));

    expect(screen.getByRole('button', { name: 'Todo el historial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(screen.getByLabelText('Hasta')).toHaveValue('');
  });

  it('serializes valid custom civil dates and holds the last valid query for invalid ranges', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    const from = screen.getByLabelText('Desde');
    const to = screen.getByLabelText('Hasta');

    fireEvent.change(from, { target: { value: '10/08/2026' } });
    fireEvent.blur(from);
    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({ dateFrom: '2026-08-10' }),
        expect.any(Object),
      );
    });

    mocks.listInvoices.mockClear();
    fireEvent.change(to, { target: { value: '01/08/2026' } });
    fireEvent.blur(to);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha inicial no puede ser posterior',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mocks.listInvoices).not.toHaveBeenCalled();

    fireEvent.change(to, { target: { value: '12/08/2026' } });
    fireEvent.blur(to);
    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          dateFrom: '2026-08-10',
          dateTo: '2026-08-12',
        }),
        expect.any(Object),
      );
    });
  });

  it('rejects an invalid civil date without issuing a request', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    mocks.listInvoices.mockClear();
    const from = screen.getByLabelText('Desde');

    fireEvent.change(from, { target: { value: '31/02/2026' } });
    fireEvent.blur(from);

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Ingresa una fecha válida con el formato DD/MM/AAAA.',
    );
    expect(mocks.listInvoices).not.toHaveBeenCalled();
    expect(from).toHaveValue('');
  });

  it('combines server filters and preserves them while paginating', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sin ticket' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Recibida (gasto)' }));
    fireEvent.change(screen.getByLabelText('RFC del emisor'), {
      target: { value: 'XAXX010101000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));

    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          page: 1,
          limit: 20,
          matchStatus: 'unmatched',
          type: 'egreso',
          issuerRfc: 'XAXX010101000',
          dateFrom: expect.any(String),
          dateTo: expect.any(String),
        }),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByLabelText('Go to next page'));
    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          page: 2,
          limit: 20,
          matchStatus: 'unmatched',
          type: 'egreso',
          issuerRfc: 'XAXX010101000',
          dateFrom: expect.any(String),
          dateTo: expect.any(String),
        }),
        expect.any(Object),
      );
    });
  });

  it('reset restores the approved initial filters and page 1', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Confirmadas' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByLabelText('RFC del emisor'), {
      target: { value: 'XAXX010101000' },
    });
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(mocks.listInvoices.mock.calls.length).toBeGreaterThan(1));
    fireEvent.click(screen.getByLabelText('Go to next page'));
    await screen.findByText('Página Dos');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(await screen.findByText('Emisor Uno')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2 · 25 facturas')).toBeInTheDocument();
    expect(screen.getByLabelText('RFC del emisor')).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    expect(screen.getByLabelText('Hasta')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Todo el historial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uses issuerRfc server-side only for a complete RFC', async () => {
    renderPage();
    await screen.findByText('Emisor Uno');
    mocks.listInvoices.mockClear();

    fireEvent.change(screen.getByLabelText('RFC del emisor'), {
      target: { value: 'xaxx010101000' },
    });

    await waitFor(() => {
      expect(mocks.listInvoices).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({ issuerRfc: 'XAXX010101000' }),
        expect.any(Object),
      );
    });
  });

  it('distinguishes an empty inventory from filtered zero results', async () => {
    mocks.listInvoices.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      pages: 0,
    });
    renderPage();
    expect(await screen.findByText('Sin facturas')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sin ticket' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText('No encontramos facturas con estos filtros.')).toBeInTheDocument();
  });
});

describe('InvoicesPage delete claim', () => {
  it('sends a single delete with origin companyId', async () => {
    let resolveDelete!: () => void;
    mocks.deleteInvoice.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderPage();
    await screen.findByText('Emisor Uno');
    fireEvent.click(screen.getAllByLabelText('Eliminar factura')[0]);

    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: /^Eliminar factura$/i });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mocks.deleteInvoice).toHaveBeenCalledTimes(1);
    });
    expect(mocks.deleteInvoice).toHaveBeenCalledWith('company-a', 'inv-1', expect.any(Object));

    resolveDelete();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
  });
});
