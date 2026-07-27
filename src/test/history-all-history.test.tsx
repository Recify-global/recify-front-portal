import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from '@/pages/HistoryPage';
import { last12MonthsRange } from '@/utils/financial-kpis';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  listTickets: vi.fn(),
  getDashboardDailyReport: vi.fn(),
  getDashboardKpis: vi.fn(),
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

vi.mock('@/services/tickets.service', () => ({
  listTickets: (...args: unknown[]) => mocks.listTickets(...args),
  deleteTicket: vi.fn(),
  updateTicket: vi.fn(),
}));

vi.mock('@/services/dashboard.service', () => ({
  getDashboardDailyReport: (...args: unknown[]) => mocks.getDashboardDailyReport(...args),
  getDashboardKpis: (...args: unknown[]) => mocks.getDashboardKpis(...args),
  updateDashboardDailyReportTicket: vi.fn(),
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/recify/HistoryTicketTable', () => ({
  HistoryTicketTable: ({
    emptyTitle,
    emptyDescription,
  }: {
    emptyTitle?: string;
    emptyDescription?: string;
  }) => (
    <div>
      <p>{emptyTitle}</p>
      <p>{emptyDescription}</p>
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <HistoryPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.companyId = 'company-a';
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
    period: { from: '2025-07-12T06:00:00.000Z', to: '2026-07-12T06:00:00.000Z' },
    totalIncome: { amount: 10, count: 1 },
    totalExpenses: { amount: 5, count: 1 },
    netBalance: 5,
    topPaymentMethod: { paymentMethod: 'card', count: 1 },
  });
});

afterEach(cleanup);

describe('HistoryPage Todo el historial preset', () => {
  it('keeps Último año as default and shows Todo el historial', async () => {
    renderHistory();
    const yearButton = await screen.findByRole('button', { name: 'Último año' });
    const allButton = screen.getByRole('button', { name: 'Todo el historial' });
    expect(yearButton).toHaveAttribute('aria-pressed', 'true');
    expect(allButton).toHaveAttribute('aria-pressed', 'false');

    const expected = last12MonthsRange();
    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          page: 1,
          limit: 100,
          dateFrom: expected.dateFrom,
          dateTo: expected.dateTo,
        }),
      );
    });
  });

  it('selecting Todo el historial omits dates and does not fan-out pages', async () => {
    renderHistory();
    await screen.findByRole('button', { name: 'Último año' });
    mocks.listTickets.mockClear();
    mocks.getDashboardDailyReport.mockClear();
    mocks.getDashboardKpis.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Todo el historial' }));

    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledTimes(1);
      expect(mocks.getDashboardDailyReport).toHaveBeenCalledTimes(1);
      expect(mocks.getDashboardKpis).toHaveBeenCalledTimes(1);
    });

    expect(mocks.listTickets).toHaveBeenCalledWith('company-a', {
      page: 1,
      limit: 100,
    });
    expect(mocks.getDashboardDailyReport).toHaveBeenCalledWith('company-a', {
      page: 1,
      limit: 100,
    });
    expect(mocks.getDashboardKpis).toHaveBeenCalledWith('company-a', {});
    expect(mocks.listTickets.mock.calls[0][1]).not.toHaveProperty('dateFrom');
    expect(mocks.listTickets.mock.calls[0][1]).not.toHaveProperty('dateTo');
    expect(screen.getByRole('button', { name: 'Todo el historial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not refetch when clicking the already active all preset', async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Todo el historial' }));
    await waitFor(() => expect(mocks.listTickets).toHaveBeenCalled());
    mocks.listTickets.mockClear();
    mocks.getDashboardDailyReport.mockClear();
    mocks.getDashboardKpis.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Todo el historial' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mocks.listTickets).not.toHaveBeenCalled();
    expect(mocks.getDashboardDailyReport).not.toHaveBeenCalled();
    expect(mocks.getDashboardKpis).not.toHaveBeenCalled();
  });

  it('restores ranged filters when leaving Todo el historial', async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Todo el historial' }));
    await waitFor(() =>
      expect(mocks.listTickets).toHaveBeenCalledWith('company-a', {
        page: 1,
        limit: 100,
      }),
    );
    mocks.listTickets.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          page: 1,
          limit: 100,
          dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          dateTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });
    const todayCall = mocks.listTickets.mock.calls.at(-1)?.[1] as {
      dateFrom: string;
      dateTo: string;
    };
    expect(todayCall.dateFrom).toBe(todayCall.dateTo);

    mocks.listTickets.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Último año' }));
    const year = last12MonthsRange();
    await waitFor(() => {
      expect(mocks.listTickets).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining({
          dateFrom: year.dateFrom,
          dateTo: year.dateTo,
        }),
      );
    });
  });

  it('uses empty copy without range wording for all-history', async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Todo el historial' }));
    expect(await screen.findByText('No hay tickets registrados')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay tickets cargados para esta compañía.')).toBeInTheDocument();
    expect(screen.queryByText(/rango de fechas/i)).not.toBeInTheDocument();
  });
});
