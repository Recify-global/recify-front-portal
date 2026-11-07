import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceBatchUploadDialog } from '@/components/recify/InvoiceBatchUploadDialog';
import type { BackendInvoice } from '@/types/invoice';

const state = vi.hoisted(() => ({ generation: 0 }));
const mocks = vi.hoisted(() => ({
  uploadAll: vi.fn(),
  clear: vi.fn(),
  invalidateInvoiceQueries: vi.fn(),
  writeInvoiceCache: vi.fn(),
}));

vi.mock('@/auth/session-cleanup', () => ({
  captureAuthMutationContext: () => ({ authSessionGeneration: state.generation }),
  isAuthMutationContextCurrent: (context: { authSessionGeneration: number }) =>
    context.authSessionGeneration === state.generation,
}));

vi.mock('@/utils/invoice-queries', () => ({
  invalidateInvoiceQueries: mocks.invalidateInvoiceQueries,
  writeInvoiceCache: mocks.writeInvoiceCache,
}));

vi.mock('@/hooks/use-invoice-batch-upload', () => ({
  useInvoiceBatchUpload: () => ({
    items: [
      {
        id: 'pending-1',
        file: new File(['%PDF-'], 'a.pdf', { type: 'application/pdf' }),
        fileKey: 'a',
        status: 'pending',
        companyId: 'company-a',
        error: null,
        unconfirmed: false,
        invoiceId: null,
      },
    ],
    maxFiles: 5,
    pendingCount: 1,
    isUploading: false,
    addFiles: vi.fn(),
    removeItem: vi.fn(),
    retryItem: vi.fn(),
    uploadAll: mocks.uploadAll,
    clear: mocks.clear,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function invoice(id: string): BackendInvoice {
  return {
    _id: id,
    uuid: null,
    type: 'egreso',
    issuerRfc: null,
    issuerName: null,
    receiverRfc: null,
    receiverName: null,
    date: '2026-10-12T06:00:00.000Z',
    subtotal: null,
    tax: null,
    total: 10,
    paymentForm: null,
    paymentMethod: null,
    fileUrl: 'https://files.example/a.pdf',
    ticketId: null,
    matchStatus: 'unmatched',
    matchCandidates: [],
    created_at: '2026-10-12T06:00:00.000Z',
    updated_at: '2026-10-12T06:00:00.000Z',
  };
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<InvoiceBatchUploadDialog open onOpenChange={vi.fn()} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.generation = 0;
  mocks.invalidateInvoiceQueries.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('invoice batch cache', () => {
  it('writes and invalidates only companies with a confirmed invoice', async () => {
    const saved = invoice('invoice-a');
    mocks.uploadAll.mockResolvedValue({
      saved: [{ companyId: 'company-a', invoice: saved }],
      failed: 1,
      alreadyRunning: false,
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Subir facturas (1)' }));

    await waitFor(() => {
      expect(mocks.writeInvoiceCache).toHaveBeenCalledTimes(1);
      expect(mocks.writeInvoiceCache).toHaveBeenCalledWith(
        expect.any(QueryClient),
        'company-a',
        saved,
      );
      expect(mocks.invalidateInvoiceQueries).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateInvoiceQueries).toHaveBeenCalledWith(
        expect.any(QueryClient),
        'company-a',
      );
    });
  });

  it('does not touch the cache when nothing was confirmed', async () => {
    mocks.uploadAll.mockResolvedValue({ saved: [], failed: 1, alreadyRunning: false });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Subir facturas (1)' }));

    await waitFor(() => expect(mocks.uploadAll).toHaveBeenCalledOnce());
    expect(mocks.writeInvoiceCache).not.toHaveBeenCalled();
    expect(mocks.invalidateInvoiceQueries).not.toHaveBeenCalled();
  });

  it('drops cache updates when the session changed during the upload', async () => {
    mocks.uploadAll.mockImplementation(async () => {
      state.generation += 1;
      return {
        saved: [{ companyId: 'company-a', invoice: invoice('invoice-a') }],
        failed: 0,
        alreadyRunning: false,
      };
    });
    renderDialog();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subir facturas (1)' }));
    });

    expect(mocks.writeInvoiceCache).not.toHaveBeenCalled();
    expect(mocks.invalidateInvoiceQueries).not.toHaveBeenCalled();
  });
});
