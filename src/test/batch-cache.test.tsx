import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchUploadDialog } from '@/components/recify/BatchUploadDialog';

const state = vi.hoisted(() => ({
  generation: 0,
}));

const mocks = vi.hoisted(() => ({
  saveAll: vi.fn(),
  saveItem: vi.fn(),
  clear: vi.fn(),
  invalidateTicketDerivedQueries: vi.fn(),
  invalidateInvoiceQueries: vi.fn(),
}));

vi.mock('@/auth/session-cleanup', () => ({
  captureAuthMutationContext: () => ({
    authSessionGeneration: state.generation,
  }),
  isAuthMutationContextCurrent: (context: { authSessionGeneration: number }) =>
    context.authSessionGeneration === state.generation,
}));

vi.mock('@/utils/ticket-derived-queries', () => ({
  invalidateTicketDerivedQueries: mocks.invalidateTicketDerivedQueries,
}));

vi.mock('@/utils/invoice-queries', () => ({
  invalidateInvoiceQueries: mocks.invalidateInvoiceQueries,
}));

vi.mock('@/hooks/use-batch-upload', () => ({
  useBatchUpload: () => ({
    items: [],
    counts: {
      queued: 0,
      analyzing: 0,
      analyzed: 2,
      saving: 0,
      saved: 0,
      error: 0,
    },
    addFiles: vi.fn(() => ({ accepted: [], rejected: [] })),
    removeItem: vi.fn(),
    retryItem: vi.fn(),
    saveItem: mocks.saveItem,
    saveAll: mocks.saveAll,
    clear: mocks.clear,
    maxFiles: 20,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

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
  vi.clearAllMocks();
  state.generation = 0;
  mocks.invalidateTicketDerivedQueries.mockResolvedValue(undefined);
  mocks.invalidateInvoiceQueries.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('batch cache effects', () => {
  it('invalidates derived data once per unique successful company and invoices on match', async () => {
    mocks.saveAll.mockResolvedValue({
      ok: 2,
      failed: 1,
      persistedCompanyIds: ['company-a', 'company-a'],
      matchedInvoiceCompanyIds: ['company-a'],
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar analizados (2)' }));

    await waitFor(() => {
      expect(mocks.invalidateTicketDerivedQueries).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateTicketDerivedQueries).toHaveBeenCalledWith(
        expect.any(QueryClient),
        'company-a',
        {
          tickets: true,
          dailyReport: true,
          financialKpis: true,
          dashboardAnalytics: true,
        },
      );
      expect(mocks.invalidateInvoiceQueries).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateInvoiceQueries).toHaveBeenCalledWith(
        expect.any(QueryClient),
        'company-a',
      );
    });
  });

  it('does not invalidate for failed items', async () => {
    mocks.saveAll.mockResolvedValue({
      ok: 0,
      failed: 2,
      persistedCompanyIds: [],
      matchedInvoiceCompanyIds: [],
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar analizados (2)' }));
    await waitFor(() => expect(mocks.saveAll).toHaveBeenCalledOnce());

    expect(mocks.invalidateTicketDerivedQueries).not.toHaveBeenCalled();
    expect(mocks.invalidateInvoiceQueries).not.toHaveBeenCalled();
  });

  it('does not invalidate when a batch resolves after logout', async () => {
    let resolveBatch!: (value: unknown) => void;
    mocks.saveAll.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar analizados (2)' }));
    await waitFor(() => expect(mocks.saveAll).toHaveBeenCalledOnce());

    state.generation += 1;
    await act(async () => {
      resolveBatch({
        ok: 2,
        failed: 0,
        persistedCompanyIds: ['company-a'],
        matchedInvoiceCompanyIds: ['company-a'],
      });
    });

    expect(mocks.invalidateTicketDerivedQueries).not.toHaveBeenCalled();
    expect(mocks.invalidateInvoiceQueries).not.toHaveBeenCalled();
  });
});
