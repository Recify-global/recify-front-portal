import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardDailyReport, useTickets } from '@/hooks/use-tickets';
import {
  useInvoices,
  useDeleteInvoice,
  useUploadInvoice,
} from '@/hooks/use-invoices';
import { useUploadTicket } from '@/hooks/use-upload-ticket';
import type { InvoicesListParams } from '@/types/invoice';
import type { TicketsListParams } from '@/types/ticket';
import {
  invoiceListQueryKey,
  invoiceDetailQueryKey,
  normalizeInvoiceListParams,
} from '@/utils/invoice-queries';
import {
  normalizeTicketListParams,
  ticketListQueryKey,
} from '@/utils/ticket-queries';
import {
  markAuthSessionActive,
  terminateAuthSession,
} from '@/auth/session-cleanup';
import { setAuthSession } from '@/auth/storage';
import type { AuthUser } from '@/types/auth';

const authState = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
}));

const mocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
  getDashboardDailyReport: vi.fn(),
  listInvoices: vi.fn(),
  uploadTicket: vi.fn(),
  uploadInvoice: vi.fn(),
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
  getDashboardDailyReport: mocks.getDashboardDailyReport,
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
  uploadInvoice: mocks.uploadInvoice,
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const emptyTickets = { data: [], total: 0, page: 1, limit: 100, pages: 0 };
const emptyInvoices = { data: [], total: 0, page: 1, limit: 20, pages: 0 };
type RuntimeEntityQueryOptions = {
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};
const userB: AuthUser = {
  _id: 'user-b',
  name: 'User B',
  email: 'b@recify.test',
  role: 'admin',
  companies: ['company-b'],
  status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  markAuthSessionActive();
  authState.companyId = 'company-a';
  mocks.listTickets.mockResolvedValue(emptyTickets);
  mocks.getDashboardDailyReport.mockResolvedValue({
    filters: {},
    tickets: [],
    total: 0,
    page: 1,
    limit: 100,
    pages: 0,
  });
  mocks.listInvoices.mockResolvedValue(emptyInvoices);
  mocks.uploadTicket.mockResolvedValue({
    imageUrl: 'https://files.example/t.jpg',
    ocrText: '',
    ticket: { _id: 't1', companyId: 'company-a' },
    matchedInvoice: null,
  });
  mocks.uploadInvoice.mockResolvedValue({
    invoice: { _id: 'inv-a', matchCandidates: [] },
    match: { candidates: [] },
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

    const first = renderHook(() => useTickets(params), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.listTickets).toHaveBeenCalledTimes(1));
    const key = ticketListQueryKey('company-a', params);
    const query = queryClient.getQueryCache().find({ queryKey: key });
    const options = query?.options as RuntimeEntityQueryOptions | undefined;

    expect(options?.staleTime).toBe(30_000);
    expect(options?.gcTime).toBe(300_000);
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.refetchOnReconnect).toBe(true);

    first.unmount();
    renderHook(() => useTickets(params), { wrapper: createWrapper(queryClient) });
    await new Promise((resolve) => setTimeout(resolve, 20));
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

  it('passes React Query AbortSignals to tickets and daily report services', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);

    renderHook(() => useTickets({ page: 1, limit: 100 }), { wrapper });
    renderHook(() => useDashboardDailyReport({ page: 1, limit: 100 }), { wrapper });

    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledOnce();
      expect(mocks.getDashboardDailyReport).toHaveBeenCalledOnce();
    });

    expect(mocks.listTickets.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(mocks.getDashboardDailyReport.mock.calls[0]?.[2]?.signal).toBeInstanceOf(
      AbortSignal,
    );
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

  it('late ticket upload after logout and a new login has no cache effects', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let resolveUpload!: (value: unknown) => void;
    mocks.uploadTicket.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const { result } = renderHook(() => useUploadTicket(), {
      wrapper: createWrapper(queryClient),
    });

    const pending = result.current.mutateAsync({
      companyId: 'company-a',
      file: new File(['x'], 'late.jpg', { type: 'image/jpeg' }),
    });
    await waitFor(() => expect(mocks.uploadTicket).toHaveBeenCalledOnce());

    await terminateAuthSession();
    setAuthSession({ token: 'token-b', user: userB });
    markAuthSessionActive();
    authState.companyId = 'company-b';
    await act(async () => {
      resolveUpload({
        imageUrl: 'https://files.example/late.jpg',
        ocrText: '',
        ticket: { _id: 'late-ticket', companyId: 'company-a' },
        matchedInvoice: null,
      });
      await pending;
    });

    expect(invalidate).not.toHaveBeenCalled();
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

    const first = renderHook(() => useInvoices(params), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(mocks.listInvoices).toHaveBeenCalledTimes(1);
    const key = invoiceListQueryKey('company-a', params);
    const query = queryClient.getQueryCache().find({ queryKey: key });
    const options = query?.options as RuntimeEntityQueryOptions | undefined;

    expect(options?.staleTime).toBe(30_000);
    expect(options?.gcTime).toBe(300_000);
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.refetchOnReconnect).toBe(true);

    first.unmount();
    renderHook(() => useInvoices(params), { wrapper: createWrapper(queryClient) });
    await new Promise((resolve) => setTimeout(resolve, 20));
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

  it('does not expose previous data as placeholder across company keys', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let resolveCompanyB!: (value: typeof emptyInvoices) => void;
    mocks.listInvoices
      .mockResolvedValueOnce({ ...emptyInvoices, data: [{ _id: 'inv-a' }] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCompanyB = resolve;
          }),
      );

    const { result, rerender } = renderHook(() => useInvoices({ page: 1, limit: 20 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.data?.data?.[0]?._id).toBe('inv-a'));

    authState.companyId = 'company-b';
    rerender();

    expect(result.current.data).toBeUndefined();
    await act(async () => {
      resolveCompanyB(emptyInvoices);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('late invoice upload after logout neither writes nor invalidates cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let resolveUpload!: (value: unknown) => void;
    mocks.uploadInvoice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const { result } = renderHook(() => useUploadInvoice(), {
      wrapper: createWrapper(queryClient),
    });

    const pending = result.current.mutateAsync({
      companyId: 'company-a',
      file: new File(['pdf'], 'late.pdf', { type: 'application/pdf' }),
    });
    await waitFor(() => expect(mocks.uploadInvoice).toHaveBeenCalledOnce());

    await terminateAuthSession();
    await act(async () => {
      resolveUpload({
        invoice: { _id: 'inv-late', matchCandidates: [] },
        match: { candidates: [] },
      });
      await pending;
    });

    expect(queryClient.getQueryData(invoiceDetailQueryKey('company-a', 'inv-late'))).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
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
