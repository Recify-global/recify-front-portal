import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinancialKpis } from '@/hooks/use-financial-kpis';
import { useDashboardDailyReport, useTickets } from '@/hooks/use-tickets';

const mocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
  getDashboardDailyReport: vi.fn(),
  getDashboardKpis: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: 'company-a' }),
}));

vi.mock('@/services/tickets.service', () => ({
  listTickets: mocks.listTickets,
  getTicket: vi.fn(),
}));

vi.mock('@/services/dashboard.service', () => ({
  getDashboardDailyReport: mocks.getDashboardDailyReport,
  getDashboardKpis: mocks.getDashboardKpis,
  updateDashboardDailyReportTicket: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTickets.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, pages: 0 });
  mocks.getDashboardDailyReport.mockResolvedValue({
    filters: {},
    tickets: [],
    page: 1,
    limit: 100,
    total: 0,
    pages: 0,
  });
  mocks.getDashboardKpis.mockResolvedValue({
    period: { from: null, to: null },
    totalIncome: { amount: 0, count: 0 },
    totalExpenses: { amount: 0, count: 0 },
    netBalance: 0,
    topPaymentMethod: null,
  });
});

afterEach(cleanup);

describe('shared History and KPI date filters', () => {
  it('keeps company and both dates in requests and query keys', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const dateFrom = '2026-07-06';
    const dateTo = '2026-07-12';

    renderHook(
      () => {
        useTickets({ page: 1, limit: 100, dateFrom, dateTo });
        useDashboardDailyReport({ page: 1, limit: 100, dateFrom, dateTo });
        useFinancialKpis({ dateFrom, dateTo, category: 'all' });
      },
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledWith('company-a', {
        page: 1,
        limit: 100,
        dateFrom,
        dateTo,
      });
      expect(mocks.getDashboardDailyReport).toHaveBeenCalledWith('company-a', {
        page: 1,
        limit: 100,
        dateFrom,
        dateTo,
      });
      expect(mocks.getDashboardKpis).toHaveBeenCalledWith('company-a', {
        dateFrom: '2026-07-06T00:00:00.000-06:00',
        dateTo: '2026-07-12T23:59:59.999-06:00',
      });
    });

    const keys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(keys).toContainEqual([
      'tickets',
      'company-a',
      { page: 1, limit: 100, dateFrom, dateTo },
    ]);
    expect(keys).toContainEqual([
      'dashboard-daily-report',
      'company-a',
      { page: 1, limit: 100, dateFrom, dateTo },
    ]);
    expect(keys).toContainEqual([
      'dashboard-kpis',
      'company-a',
      '2026-07-06T00:00:00.000-06:00',
      '2026-07-12T23:59:59.999-06:00',
    ]);
  });
});
