import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from '@/pages/HistoryPage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatMxn, last12MonthsRange } from '@/utils/financial-kpis';
import { ticketListQueryKey } from '@/utils/ticket-queries';

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
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>
        <HistoryPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { view, client };
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
        { signal: expect.any(AbortSignal) },
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

    expect(mocks.listTickets).toHaveBeenCalledWith(
      'company-a',
      {
        page: 1,
        limit: 100,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(mocks.getDashboardDailyReport).toHaveBeenCalledWith('company-a', {
      page: 1,
      limit: 100,
    }, { signal: expect.any(AbortSignal) });
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

  it('reuses the fresh Último año query when returning to the same key', async () => {
    const { client } = renderHistory();
    const year = last12MonthsRange();
    await waitFor(() =>
      expect(mocks.listTickets).toHaveBeenCalledWith(
        'company-a',
        expect.objectContaining(year),
        { signal: expect.any(AbortSignal) },
      ),
    );
    const yearKey = ticketListQueryKey('company-a', {
      page: 1,
      limit: 100,
      ...year,
    });
    const cachedYearData = client.getQueryData(yearKey);

    fireEvent.click(await screen.findByRole('button', { name: 'Todo el historial' }));
    await waitFor(() =>
      expect(mocks.listTickets).toHaveBeenCalledWith(
        'company-a',
        { page: 1, limit: 100 },
        { signal: expect.any(AbortSignal) },
      ),
    );

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
        { signal: expect.any(AbortSignal) },
      );
    });
    const todayCall = mocks.listTickets.mock.calls.at(-1)?.[1] as {
      dateFrom: string;
      dateTo: string;
    };
    expect(todayCall.dateFrom).toBe(todayCall.dateTo);

    const requestsBeforeReturn = mocks.listTickets.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Último año' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Último año' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mocks.listTickets).toHaveBeenCalledTimes(requestsBeforeReturn);
    expect(client.getQueryData(yearKey)).toBe(cachedYearData);
  });

  it('uses empty copy without range wording for all-history', async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: 'Todo el historial' }));
    expect(await screen.findByText('No hay tickets registrados')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay tickets cargados para esta compañía.')).toBeInTheDocument();
    expect(screen.queryByText(/rango de fechas/i)).not.toBeInTheDocument();
  });
});

const HISTORY_METRIC_INFO = {
  income: {
    title: 'Ingresos totales',
    text: 'Suma de ingresos de todos los tickets de la compañía en el período de fechas seleccionado. Si no hay fechas, usa todo el historial.',
    label: 'Información sobre Ingresos totales',
  },
  expense: {
    title: 'Egresos totales',
    text: 'Suma de egresos de todos los tickets de la compañía en el período de fechas seleccionado. Si no hay fechas, usa todo el historial.',
    label: 'Información sobre Egresos totales',
  },
  balance: {
    title: 'Saldo neto',
    text: 'Ingresos menos egresos de todos los tickets de la compañía en el período de fechas seleccionado.',
    label: 'Información sobre Saldo neto',
  },
  paymentMethod: {
    title: 'Método más usado',
    text: 'Método de pago con más movimientos entre todos los tickets de la compañía en el período de fechas seleccionado.',
    label: 'Información sobre Método más usado',
  },
} as const;

describe('HistoryPage metrics UI', () => {
  it('renders tickets, date controls, KPI values and four info triggers', async () => {
    renderHistory();

    expect(await screen.findByRole('heading', { name: 'Histórico de tickets' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(formatMxn(10))).toBeInTheDocument();
    });
    expect(screen.getAllByText(formatMxn(5)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();

    const metricEntries = Object.values(HISTORY_METRIC_INFO);
    expect(metricEntries).toHaveLength(4);
    for (const metric of metricEntries) {
      expect(screen.getByText(metric.title)).toBeInTheDocument();
      const trigger = screen.getByRole('button', { name: metric.label });
      expect(trigger).toBeEnabled();
    }

    const expected = last12MonthsRange();
    expect(mocks.listTickets).toHaveBeenCalledWith(
      'company-a',
      expect.objectContaining({
        page: 1,
        limit: 100,
        dateFrom: expected.dateFrom,
        dateTo: expected.dateTo,
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it('shows the matching tooltip for each metric card', async () => {
    renderHistory();

    for (const metric of Object.values(HISTORY_METRIC_INFO)) {
      const trigger = await screen.findByRole('button', { name: metric.label });
      fireEvent.focus(trigger);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(metric.text);
      fireEvent.blur(trigger);
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      });
    }
  });
});
