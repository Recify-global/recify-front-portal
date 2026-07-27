import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoicesPage from '@/pages/InvoicesPage';
import type { BackendInvoice } from '@/types/invoice';
import { ApiRequestError } from '@/api/http';

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
  it('renders list and does not crash with null UUID search', async () => {
    renderPage();
    expect(await screen.findByText('Emisor Uno')).toBeInTheDocument();
    expect(screen.getByText('Sin Folio SA')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar'), {
      target: { value: 'sin folio' },
    });

    expect(screen.getByText('Sin Folio SA')).toBeInTheDocument();
    expect(screen.queryByText('Emisor Uno')).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'abc' } });
    expect(screen.getByLabelText('Limpiar búsqueda')).toBeInTheDocument();
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
