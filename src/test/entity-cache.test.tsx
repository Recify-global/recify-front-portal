import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTickets } from '@/hooks/use-tickets';
import { useInvoices, useDeleteInvoice } from '@/hooks/use-invoices';
import { useUploadTicket } from '@/hooks/use-upload-ticket';
import type { InvoicesListParams } from '@/types/invoice';
import type { TicketsListParams } from '@/types/ticket';
import {
  invoiceListQueryKey,
  normalizeInvoiceListParams,
} from '@/utils/invoice-queries';
import {
  normalizeTicketListParams,
  ticketListQueryKey,
} from '@/utils/ticket-queries';

const authState = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
}));

const mocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
  listInvoices: vi.fn(),
  uploadTicket: vi.fn(),
  deleteInvoice: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: authState.companyId }),
}));

vi.mock('@/services/tickets.service', () => ({
  listTickets: mocks.listTickets,
  deleteTicket: vi.fn(),
}));

vi.mock('@/services/dashboard.service', () => ({
  getDashboardDailyReport: vi.fn(),
  updateDashboardDailyReportTicket: vi.fn(),
}));

vi.mock('@/services/invoices.service', () => ({
  listInvoices: mocks.listInvoices,
  getInvoice: vi.fn(),
  getInvoiceMatchCandidates: vi.fn(),
  confirmInvoiceMatch: vi.fn(),
  unlinkInvoiceMatch: vi.fn(),
  updateInvoiceMatchStatus: vi.fn(),
  deleteInvoice: mocks.deleteInvoice,
}));

vi.mock('@/services/upload.service', () => ({
  uploadTicket: mocks.uploadTicket,
  preprocessTicket: vi.fn(),
  uploadInvoice: vi.fn(),
}));

vi.mock('@/auth/session-cleanup', () => ({
  isAuthSessionClosing: () => false,
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const emptyTickets = { data: [], total: 0, page: 1, limit: 100, pages: 0 };
const emptyInvoices = { data: [], total: 0, page: 1, limit: 20, pages: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  authState.companyId = 'company-a';
  mocks.listTickets.mockResolvedValue(emptyTickets);
  mocks.listInvoices.mockResolvedValue(emptyInvoices);
  mocks.uploadTicket.mockResolvedValue({
    imageUrl: 'https://files.example/t.jpg',
    ocrText: '',
    ticket: { _id: 't1', companyId: 'company-a' },
    matchedInvoice: null,
  });
  mocks.deleteInvoice.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('normalize filters for stable keys', () => {
  it('omits empty ticket filter fields', () => {
    expect(
      normalizeTicketListParams({
        page: 1,
        limit: 100,
        dateFrom: '',
        dateTo: undefined,
        category: '  ',
      }),
    ).toEqual({ page: 1, limit: 100 });
  });

  it('omits empty invoice filter fields', () => {
    expect(
      normalizeInvoiceListParams({
        page: 2,
        limit: 20,
        dateFrom: '',
        issuerRfc: '   ',
      }),
    ).toEqual({ page: 2, limit: 20 });
  });
});

describe('tickets cache', () => {
  it('reuses a fresh cache for the same company and filters', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const params = { page: 1, limit: 100, dateFrom: '2026-07-01' };

    const { rerender } = renderHook(() => useTickets(params), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.listTickets).toHaveBeenCalledTimes(1));

    rerender();
    await act(async () => {
      await queryClient.fetchQuery({
        queryKey: ticketListQueryKey('company-a', params),
        queryFn: () => mocks.listTickets('company-a', normalizeTicketListParams(params)),
        staleTime: 30_000,
      });
    });

    expect(mocks.listTickets).toHaveBeenCalledTimes(1);
  });

  it('uses a distinct key when filters change', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = renderHook(
      ({ filters }: { filters: TicketsListParams }) => useTickets(filters),
      {
        initialProps: { filters: { page: 1, limit: 100 } satisfies TicketsListParams },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.listTickets).toHaveBeenCalledTimes(1));

    rerender({
      filters: { page: 1, limit: 100, dateFrom: '2026-07-01' } satisfies TicketsListParams,
    });

    await waitFor(() => expect(mocks.listTickets).toHaveBeenCalledTimes(2));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(ticketListQueryKey('company-a', { page: 1, limit: 100 }));
    expect(keys).toContainEqual(
      ticketListQueryKey('company-a', { page: 1, limit: 100, dateFrom: '2026-07-01' }),
    );
  });

  it('does not reuse data across companies', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listTickets
      .mockResolvedValueOnce({ ...emptyTickets, data: [{ _id: 'a' }] })
      .mockResolvedValueOnce({ ...emptyTickets, data: [{ _id: 'b' }] });

    const { result, rerender } = renderHook(() => useTickets({ page: 1, limit: 100 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data?.data?.[0]?._id).toBe('a'));

    authState.companyId = 'company-b';
    rerender();

    await waitFor(() => expect(result.current.data?.data?.[0]?._id).toBe('b'));
    expect(result.current.data?.data?.[0]?._id).not.toBe('a');
    expect(mocks.listTickets).toHaveBeenCalledTimes(2);
  });

  it('does not fetch without companyId', async () => {
    authState.companyId = null;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useTickets({ page: 1, limit: 100 }), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.listTickets).not.toHaveBeenCalled();
  });

  it('upload invalidates origin company tickets, not another company', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUploadTicket(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        file: new File(['x'], 't.jpg', { type: 'image/jpeg' }),
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets', 'company-a'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['tickets', 'company-b'] });
  });

  it('late upload for A after switching to B still invalidates A only', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const deferred = {
      resolve: (_value: unknown) => {},
    };
    mocks.uploadTicket.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const { result } = renderHook(() => useUploadTicket(), {
      wrapper: createWrapper(queryClient),
    });

    const pending = result.current.mutateAsync({
      companyId: 'company-a',
      file: new File(['x'], 't.jpg', { type: 'image/jpeg' }),
    });

    await waitFor(() => {
      expect(mocks.uploadTicket).toHaveBeenCalled();
    });

    authState.companyId = 'company-b';

    await act(async () => {
      deferred.resolve({
        imageUrl: 'https://files.example/t.jpg',
        ocrText: '',
        ticket: { _id: 't1', companyId: 'company-a' },
        matchedInvoice: null,
      });
      await pending;
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets', 'company-a'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['tickets', 'company-b'] });
  });
});

describe('invoices cache', () => {
  beforeEach(() => {
    authState.companyId = 'company-a';
    mocks.listInvoices.mockReset();
    mocks.listInvoices.mockResolvedValue(emptyInvoices);
    mocks.deleteInvoice.mockReset();
    mocks.deleteInvoice.mockResolvedValue(undefined);
  });

  it('reuses a fresh cache for the same company and filters', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const params = { page: 1, limit: 20, type: 'egreso' as const };

    const { result, rerender } = renderHook(() => useInvoices(params), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.listInvoices).toHaveBeenCalledTimes(1);

    rerender();
    await act(async () => {
      await queryClient.fetchQuery({
        queryKey: invoiceListQueryKey('company-a', params),
        queryFn: () => mocks.listInvoices('company-a', normalizeInvoiceListParams(params)),
        staleTime: 30_000,
      });
    });

    expect(mocks.listInvoices).toHaveBeenCalledTimes(1);
  });

  it('uses a distinct key when page or dates change', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result, rerender } = renderHook(
      ({ filters }: { filters: InvoicesListParams }) => useInvoices(filters),
      {
        initialProps: { filters: { page: 1, limit: 20 } satisfies InvoicesListParams },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.listInvoices).toHaveBeenCalledTimes(1);

    rerender({
      filters: { page: 2, limit: 20, dateFrom: '2026-07-01' } satisfies InvoicesListParams,
    });

    await waitFor(() => expect(mocks.listInvoices).toHaveBeenCalledTimes(2));

    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(invoiceListQueryKey('company-a', { page: 1, limit: 20 }));
    expect(keys).toContainEqual(
      invoiceListQueryKey('company-a', { page: 2, limit: 20, dateFrom: '2026-07-01' }),
    );
  });

  it('keeps invoice data isolated by company', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listInvoices
      .mockResolvedValueOnce({ ...emptyInvoices, data: [{ _id: 'inv-a' }] })
      .mockResolvedValueOnce({ ...emptyInvoices, data: [{ _id: 'inv-b' }] });

    const { result, rerender } = renderHook(() => useInvoices({ page: 1, limit: 20 }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data?.data?.[0]?._id).toBe('inv-a'));

    authState.companyId = 'company-b';
    rerender();

    await waitFor(() => expect(result.current.data?.data?.[0]?._id).toBe('inv-b'));
    expect(result.current.data?.data?.[0]?._id).not.toBe('inv-a');
  });

  it('delete invalidates origin company invoices, not B', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteInvoice(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        invoiceId: 'inv-a',
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invoices', 'company-a'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['invoices', 'company-b'] });
  });

  it('late delete for A after switching to B invalidates A only', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const deferred = {
      resolve: () => {},
    };
    mocks.deleteInvoice.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const { result } = renderHook(() => useDeleteInvoice(), {
      wrapper: createWrapper(queryClient),
    });

    const pending = result.current.mutateAsync({
      companyId: 'company-a',
      invoiceId: 'inv-a',
    });

    await waitFor(() => {
      expect(mocks.deleteInvoice).toHaveBeenCalled();
    });

    authState.companyId = 'company-b';

    await act(async () => {
      deferred.resolve();
      await pending;
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invoices', 'company-a'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['invoices', 'company-b'] });
  });
});
