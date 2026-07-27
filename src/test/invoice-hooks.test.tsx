import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useConfirmInvoiceMatch,
  useDeleteInvoice,
  useInvoice,
  useUnlinkInvoiceMatch,
  useUpdateInvoiceMatchStatus,
} from '@/hooks/use-invoices';
import {
  confirmInvoiceMatch,
  deleteInvoice,
  getInvoice,
  unlinkInvoiceMatch,
  updateInvoiceMatchStatus,
} from '@/services/invoices.service';
import type { BackendInvoice } from '@/types/invoice';
import { ApiRequestError } from '@/api/http';
import { shouldRetryInvoiceQuery } from '@/utils/invoice-errors';
import { invalidateInvoiceQueries } from '@/utils/invoice-queries';

const authState = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: authState.companyId }),
}));

vi.mock('@/services/invoices.service', () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  getInvoiceMatchCandidates: vi.fn(),
  confirmInvoiceMatch: vi.fn(),
  unlinkInvoiceMatch: vi.fn(),
  updateInvoiceMatchStatus: vi.fn(),
  deleteInvoice: vi.fn(),
}));

vi.mock('@/services/upload.service', () => ({
  uploadInvoice: vi.fn(),
}));

vi.mock('@/auth/session-cleanup', () => ({
  isAuthSessionClosing: () => false,
}));

const baseInvoice = (overrides: Partial<BackendInvoice> = {}): BackendInvoice => ({
  _id: 'inv-a',
  uuid: 'AAAA1111-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  type: 'egreso',
  issuerRfc: 'XAXX010101000',
  issuerName: 'Emisor A',
  receiverRfc: null,
  receiverName: null,
  date: '2026-07-13T06:00:00.000Z',
  subtotal: 100,
  tax: 16,
  total: 116,
  paymentForm: '03',
  paymentMethod: 'PUE',
  fileUrl: 'https://files.example/a.pdf',
  ticketId: null,
  matchStatus: 'unmatched',
  matchCandidates: [],
  created_at: '2026-07-13T06:00:00.000Z',
  updated_at: '2026-07-13T06:00:00.000Z',
  ...overrides,
});

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

afterEach(() => {
  cleanup();
  authState.companyId = 'company-a';
  vi.clearAllMocks();
});

describe('invoice mutations capture origin companyId', () => {
  beforeEach(() => {
    vi.mocked(confirmInvoiceMatch).mockResolvedValue({
      invoice: baseInvoice({ matchStatus: 'confirmed', ticketId: 'ticket-1' }),
      ticket: {
        _id: 'ticket-1',
        companyId: 'company-a',
        vendor: 'V',
        type: 'egreso',
        date: '2026-07-13T06:00:00.000Z',
        amount: 116,
        category: 'Otros',
        paymentMethod: 'card',
        status: 'processed',
        reviewStatus: 'pendiente',
        created_at: '2026-07-13T06:00:00.000Z',
        updated_at: '2026-07-13T06:00:00.000Z',
      },
    });
    vi.mocked(unlinkInvoiceMatch).mockResolvedValue(baseInvoice({ matchStatus: 'unmatched' }));
    vi.mocked(updateInvoiceMatchStatus).mockResolvedValue(
      baseInvoice({ matchStatus: 'missing_ticket' }),
    );
    vi.mocked(deleteInvoice).mockResolvedValue(undefined);
  });

  it('confirm match uses company A even if active company changes before settle', async () => {
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConfirmInvoiceMatch(), { wrapper });

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutateAsync({
        companyId: 'company-a',
        invoiceId: 'inv-a',
        ticketId: 'ticket-1',
      });
    });

    authState.companyId = 'company-b';
    await act(async () => {
      await pending;
    });

    expect(confirmInvoiceMatch).toHaveBeenCalledWith(
      'company-a',
      'inv-a',
      'ticket-1',
      expect.any(Object),
    );
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invoices', 'company-a'] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['dashboard-invoiced-vs-uninvoiced', 'company-a'],
      });
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['invoices', 'company-b'] });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ['dashboard-invoiced-vs-uninvoiced', 'company-b'],
    });
  });

  it('delete uses origin company and does not touch B cache keys', async () => {
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteInvoice(), { wrapper });

    authState.companyId = 'company-b';
    await act(async () => {
      await result.current.mutateAsync({ companyId: 'company-a', invoiceId: 'inv-a' });
    });

    expect(deleteInvoice).toHaveBeenCalledWith('company-a', 'inv-a', expect.any(Object));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['invoices', 'company-a'] });
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['invoices', 'company-b'] });
  });

  it('unlink and status mutations pass explicit companyId', async () => {
    const queryClient = testQueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const unlink = renderHook(() => useUnlinkInvoiceMatch(), { wrapper });
    const status = renderHook(() => useUpdateInvoiceMatchStatus(), { wrapper });

    await act(async () => {
      await unlink.result.current.mutateAsync({ companyId: 'company-a', invoiceId: 'inv-a' });
      await status.result.current.mutateAsync({
        companyId: 'company-a',
        invoiceId: 'inv-a',
        matchStatus: 'missing_ticket',
      });
    });

    expect(unlinkInvoiceMatch).toHaveBeenCalledWith('company-a', 'inv-a', expect.any(Object));
    expect(updateInvoiceMatchStatus).toHaveBeenCalledWith(
      'company-a',
      'inv-a',
      'missing_ticket',
      expect.any(Object),
    );
  });
});

describe('useInvoice selection company guard', () => {
  it('does not fetch when selection company differs from active company', async () => {
    authState.companyId = 'company-b';
    vi.mocked(getInvoice).mockResolvedValue(baseInvoice());
    const queryClient = testQueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(
      () => useInvoice({ companyId: 'company-a', invoiceId: 'inv-a' }),
      { wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getInvoice).not.toHaveBeenCalled();
  });

  it('fetches when selection company matches active company', async () => {
    authState.companyId = 'company-a';
    vi.mocked(getInvoice).mockResolvedValue(baseInvoice());
    const queryClient = testQueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useInvoice({ companyId: 'company-a', invoiceId: 'inv-a' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInvoice).toHaveBeenCalledWith('company-a', 'inv-a', expect.any(Object));
  });
});

describe('invoice query retry policy', () => {
  it('does not retry 429/401/403/404', () => {
    expect(shouldRetryInvoiceQuery(0, new ApiRequestError('x', 429))).toBe(false);
    expect(shouldRetryInvoiceQuery(0, new ApiRequestError('x', 401))).toBe(false);
    expect(shouldRetryInvoiceQuery(0, new ApiRequestError('x', 403))).toBe(false);
    expect(shouldRetryInvoiceQuery(0, new ApiRequestError('x', 404))).toBe(false);
  });

  it('retries 500 once', () => {
    expect(shouldRetryInvoiceQuery(0, new ApiRequestError('x', 500))).toBe(true);
    expect(shouldRetryInvoiceQuery(1, new ApiRequestError('x', 500))).toBe(false);
  });
});

describe('invalidateInvoiceQueries analytics scope', () => {
  it('invalidates invoicing analytics only for origin company', async () => {
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await invalidateInvoiceQueries(queryClient, 'company-a', { invoiceId: 'inv-a' });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard-invoiced-vs-uninvoiced', 'company-a'],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard-invoiced-category-correlation', 'company-a'],
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ['dashboard-invoiced-vs-uninvoiced', 'company-b'],
    });
  });
});
