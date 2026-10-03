import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchUploadDialog } from '@/components/recify/BatchUploadDialog';
import { useBatchUpload } from '@/hooks/use-batch-upload';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import type { TicketPreview } from '@/types/ticket';

const authState = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: authState.companyId }),
}));

vi.mock('@/services/upload.service', () => ({
  preprocessTicket: vi.fn(),
  uploadTicket: vi.fn(),
}));

vi.mock('@/utils/ticket-derived-queries', () => ({
  invalidateTicketDerivedQueries: vi.fn(),
}));

vi.mock('@/utils/invoice-queries', () => ({
  invalidateInvoiceQueries: vi.fn(),
}));

vi.mock('@/hooks/use-balances', () => ({
  invalidateBalanceQueries: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const previewA: TicketPreview = {
  documentKind: 'transaction',
  type: 'egreso',
  date: '2026-09-20',
  amount: 458.3,
  tax: 63.21,
  category: 'Supermercado y Abarrotes',
  paymentMethod: 'card',
  vendor: 'Costco',
  vendorRFC: null,
};

const previewB: TicketPreview = {
  ...previewA,
  vendor: 'OXXO',
  amount: 50,
  tax: 8,
};

function jpeg(name: string) {
  return new File(['ticket'], name, { type: 'image/jpeg' });
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<BatchUploadDialog open onOpenChange={vi.fn()} />, { wrapper });
}

beforeEach(() => {
  authState.companyId = 'company-a';
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.mocked(preprocessTicket).mockImplementation(async (_companyId, file) => ({
    ocrText: 'ocr',
    ticket: file.name.includes('oxxo') ? previewB : previewA,
  }));
  vi.mocked(uploadTicket).mockResolvedValue({
    kind: 'ticket',
    imageUrl: 'https://r2.example/signed',
    ocrText: 'ocr',
    ticket: {
      _id: 'ticket-1',
      companyId: 'company-a',
      type: 'egreso',
      date: '2026-09-20T06:00:00.000Z',
      amount: 458.3,
      tax: 63.21,
      paymentMethod: 'card',
      vendor: 'Costco',
      category: 'Supermercado y Abarrotes',
      status: 'processed',
      created_at: '2026-09-20T06:00:00.000Z',
      updated_at: '2026-09-20T06:00:00.000Z',
    },
  });
});

afterEach(cleanup);

describe('batch preview accordion', () => {
  it('renders multiple tickets, expands independently, and shows the compact summary', async () => {
    renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [jpeg('costco.jpg'), jpeg('oxxo.jpg')] } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Ticket 1/)).toBeInTheDocument();
      expect(screen.getByText(/Ticket 2/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Costco/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OXXO/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Ticket 1/ }));
    const vendorCell = await screen.findByRole('button', { name: 'Editar comercio de Costco' });
    const hint = vendorCell.querySelector('[data-editable-hint]');
    expect(hint).toHaveAttribute('data-visible', 'false');
    fireEvent.mouseEnter(vendorCell);
    expect(hint).toHaveAttribute('data-visible', 'true');
    expect(hint).toHaveAttribute('data-mode', 'pointer');
    fireEvent.focus(vendorCell);
    expect(hint).toHaveAttribute('data-mode', 'focus');
    expect(vendorCell).toHaveAttribute('tabindex', '0');
    expect(screen.queryByRole('button', { name: 'Editar comercio de OXXO' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ticket 2/ }));
    expect(await screen.findByRole('button', { name: 'Editar comercio de OXXO' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar comercio de Costco' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar comercio de Costco' }), {
      target: { value: 'Costco Polanco' },
    });
    expect(screen.getByDisplayValue('Costco Polanco')).toBeInTheDocument();
    expect(screen.getByText('Modificado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar comercio de OXXO' })).toBeInTheDocument();
  });
});

describe('batch draft editing', () => {
  it('edits A without changing B, shows dirty state, and keeps keyboard access', async () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1, saveConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg'), jpeg('oxxo.jpg')]);
    });
    await waitFor(() => expect(result.current.items.every((item) => item.status === 'analyzed')).toBe(true));

    const firstId = result.current.items[0]?.id as string;
    const secondVendor = result.current.items[1]?.draft?.vendor;
    act(() => {
      result.current.updateItemDraft(firstId, { vendor: 'Costco Polanco' });
    });
    expect(result.current.items[0]?.draft?.vendor).toBe('Costco Polanco');
    expect(result.current.items[1]?.draft?.vendor).toBe(secondVendor);
  });

  it('rejects an invalid amount before save', async () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('analyzed'));
    act(() => {
      result.current.updateItemDraft(result.current.items[0].id, { amount: 'abc' });
    });
    await act(async () => {
      await result.current.saveAll();
    });
    expect(uploadTicket).not.toHaveBeenCalled();
    expect(result.current.readyCount).toBe(0);
    expect(result.current.items[0]?.draft?.amount).toBe('abc');
  });
});

describe('batch save and retry', () => {
  it('sends the edited draft on save and never PATCHes', async () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('analyzed'));
    act(() => {
      result.current.updateItemDraft(result.current.items[0].id, { vendor: 'Costco Polanco' });
    });
    await act(async () => {
      await result.current.saveItem(result.current.items[0].id);
    });
    expect(uploadTicket).toHaveBeenCalledWith(
      'company-a',
      expect.any(File),
      expect.objectContaining({
        ticketDraft: expect.objectContaining({ vendor: 'Costco Polanco', amount: 458.3 }),
      }),
    );
    const draft = vi.mocked(uploadTicket).mock.calls[0]?.[2]?.ticketDraft as Record<string, unknown>;
    expect(Object.keys(draft).sort()).toEqual([
      'amount',
      'category',
      'date',
      'paymentMethod',
      'tax',
      'type',
      'vendor',
    ]);
    expect(draft).not.toHaveProperty('_id');
    expect(draft).not.toHaveProperty('companyId');
    expect(draft).not.toHaveProperty('documentKind');
    expect(result.current.items[0]?.status).toBe('saved');
  });

  it('keeps the draft after a save error and retries save without preprocess', async () => {
    vi.mocked(uploadTicket).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('analyzed'));
    act(() => {
      result.current.updateItemDraft(result.current.items[0].id, { vendor: 'Costco Polanco' });
    });
    await act(async () => {
      await result.current.saveItem(result.current.items[0].id);
    });
    expect(result.current.items[0]?.status).toBe('error');
    expect(result.current.items[0]?.failedStage).toBe('save');
    expect(result.current.items[0]?.draft?.vendor).toBe('Costco Polanco');

    vi.mocked(preprocessTicket).mockClear();
    vi.mocked(uploadTicket).mockResolvedValueOnce({
      kind: 'ticket',
      imageUrl: 'https://r2.example/signed',
      ocrText: 'ocr',
      ticket: {
        _id: 'ticket-2',
        companyId: 'company-a',
        type: 'egreso',
        date: '2026-09-20T06:00:00.000Z',
        amount: 458.3,
        paymentMethod: 'card',
        vendor: 'Costco Polanco',
        status: 'processed',
        created_at: '2026-09-20T06:00:00.000Z',
        updated_at: '2026-09-20T06:00:00.000Z',
      },
    });
    await act(async () => {
      result.current.retryItem(result.current.items[0].id);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('saved'));
    expect(preprocessTicket).not.toHaveBeenCalled();
    expect(uploadTicket).toHaveBeenCalledWith(
      'company-a',
      expect.any(File),
      expect.objectContaining({
        ticketDraft: expect.objectContaining({ vendor: 'Costco Polanco' }),
      }),
    );
  });

  it('retries preprocess on analyze errors', async () => {
    vi.mocked(preprocessTicket).mockRejectedValueOnce(new Error('ocr fail'));
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg')]);
    });
    await waitFor(() => expect(result.current.items[0]?.failedStage).toBe('analyze'));
    act(() => {
      result.current.retryItem(result.current.items[0].id);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('analyzed'));
    expect(preprocessTicket).toHaveBeenCalledTimes(2);
  });
});

describe('batch isolation', () => {
  it('clears drafts and revokes object URLs when switching company', async () => {
    const { result, rerender } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    await act(async () => {
      result.current.addFiles([jpeg('costco.jpg')]);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    authState.companyId = 'company-b';
    rerender();
    expect(result.current.items).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:costco.jpg');
  });
});
