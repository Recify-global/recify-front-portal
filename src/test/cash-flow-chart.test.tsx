import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashFlowChart } from '@/components/recify/dashboard/CashFlowChart';
import { formatMxn } from '@/utils/dashboard-analytics';
import type { CashFlowView } from '@/types/dashboard-analytics';

const mocks = vi.hoisted(() => ({
  useCashFlow: vi.fn(),
}));

vi.mock('@/hooks/use-dashboard-analytics', () => ({
  useCashFlow: (...args: unknown[]) => mocks.useCashFlow(...args),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="cash-flow-chart-surface" style={{ width: 800, height: 300 }}>
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
              width: 800,
              height: 300,
            })
          : children}
      </div>
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function view(overrides: Partial<CashFlowView> = {}): CashFlowView {
  return {
    period: { from: '2026-08-01', to: '2026-08-31' },
    groupBy: 'month',
    buckets: [
      {
        label: 'ago 2026',
        periodStart: '2026-08-01',
        income: 0,
        expense: 904,
        net: -904,
      },
    ],
    totalIncome: 0,
    totalExpense: 904,
    netTotal: -904,
    ...overrides,
  };
}

function stubCashFlow(data: CashFlowView | undefined, extras: Record<string, unknown> = {}) {
  mocks.useCashFlow.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...extras,
  });
}

function highlightAmount(label: string): string | undefined {
  return screen.getByText(label).parentElement?.querySelector('.tabular-nums')?.textContent ?? undefined;
}

const chartProps = {
  query: { datePreset: 'last_30_days' as const },
  enabled: true,
  groupBy: 'month' as const,
  onGroupByChange: vi.fn(),
};

describe('CashFlowChart', () => {
  beforeEach(() => {
    chartProps.onGroupByChange = vi.fn();
  });

  it('renders the cash flow card with the existing series and period label', () => {
    stubCashFlow(view());
    render(<CashFlowChart {...chartProps} />);

    expect(screen.getByRole('heading', { name: 'Flujo de caja' })).toBeInTheDocument();
    expect(screen.getByText('Ingresos, egresos y balance neto por período')).toBeInTheDocument();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getByText('Egresos')).toBeInTheDocument();
    expect(screen.getByText('Balance neto')).toBeInTheDocument();
    expect(screen.getByText('ago 2026')).toBeInTheDocument();
    expect(screen.getByTestId('cash-flow-chart-surface')).toBeInTheDocument();
  });

  it('shows the received values without flipping a negative net balance', () => {
    stubCashFlow(view());
    render(<CashFlowChart {...chartProps} />);

    expect(highlightAmount('Ingresos')).toBe(formatMxn(0));
    expect(highlightAmount('Egresos')).toBe(formatMxn(904));
    expect(highlightAmount('Balance neto')).toBe(formatMxn(-904));
    expect(highlightAmount('Balance neto')).not.toBe(formatMxn(904));
  });

  it('keeps a positive net balance as a positive formatted amount', () => {
    stubCashFlow(
      view({
        buckets: [
          {
            label: 'jul 2026',
            periodStart: '2026-07-01',
            income: 1200,
            expense: 400,
            net: 800,
          },
        ],
        totalIncome: 1200,
        totalExpense: 400,
        netTotal: 800,
      }),
    );
    render(<CashFlowChart {...chartProps} />);

    expect(highlightAmount('Ingresos')).toBe(formatMxn(1200));
    expect(highlightAmount('Egresos')).toBe(formatMxn(400));
    expect(highlightAmount('Balance neto')).toBe(formatMxn(800));
  });

  it('keeps the empty state when there are no periods', () => {
    stubCashFlow(view({ buckets: [], totalIncome: 0, totalExpense: 0, netTotal: 0 }));
    render(<CashFlowChart {...chartProps} />);

    expect(screen.getByText('Sin datos en el período seleccionado.')).toBeInTheDocument();
    expect(screen.queryByTestId('cash-flow-chart-surface')).not.toBeInTheDocument();
  });

  it('keeps the Semanal / Mensual selector wired to the existing groupBy callback', () => {
    stubCashFlow(view());
    render(<CashFlowChart {...chartProps} groupBy="month" />);

    fireEvent.click(screen.getByRole('button', { name: 'Semanal' }));
    expect(chartProps.onGroupByChange).toHaveBeenCalledWith('week');

    fireEvent.click(screen.getByRole('button', { name: 'Mensual' }));
    expect(chartProps.onGroupByChange).toHaveBeenCalledWith('month');
  });
});
