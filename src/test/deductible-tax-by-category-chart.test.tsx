import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeductibleTaxByCategoryChart } from '@/components/recify/dashboard/DeductibleTaxByCategoryChart';
import { formatMxn } from '@/utils/dashboard-analytics';
import type { DeductibleTaxByCategoryView } from '@/types/dashboard-analytics';

const mocks = vi.hoisted(() => ({
  useDeductibleTaxByCategory: vi.fn(),
}));

vi.mock('@/hooks/use-dashboard-analytics', () => ({
  useDeductibleTaxByCategory: (...args: unknown[]) =>
    mocks.useDeductibleTaxByCategory(...args),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="deductible-tax-chart" style={{ width: 600, height: 260 }}>
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
              width: 600,
              height: 260,
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

function stubChart(data: DeductibleTaxByCategoryView) {
  mocks.useDeductibleTaxByCategory.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('DeductibleTaxByCategoryChart', () => {
  it('renders the existing categories and total in the bar chart card', () => {
    stubChart({
      period: { from: '2026-08-01', to: '2026-08-31' },
      rows: [
        {
          category: 'Alimentos',
          deductibleTax: 1250,
          nonDeductibleTax: 100,
          totalTax: 1350,
          count: 4,
        },
        {
          category: 'Servicios',
          deductibleTax: 850,
          nonDeductibleTax: 0,
          totalTax: 850,
          count: 2,
        },
      ],
      totalDeductible: 2100,
    });

    render(
      <DeductibleTaxByCategoryChart
        query={{ datePreset: 'last_30_days' }}
        enabled
      />,
    );

    expect(screen.getByRole('heading', { name: 'IVA deducible por categoría' })).toBeInTheDocument();
    expect(screen.getByText('Alimentos')).toBeInTheDocument();
    expect(screen.getByText('Servicios')).toBeInTheDocument();
    expect(screen.getByText(formatMxn(2100))).toBeInTheDocument();
    expect(screen.getByTestId('deductible-tax-chart')).toBeInTheDocument();
  });

  it('keeps the existing empty state when no categories are available', () => {
    stubChart({
      period: { from: null, to: null },
      rows: [],
      totalDeductible: 0,
    });

    render(<DeductibleTaxByCategoryChart query={{}} enabled />);

    expect(screen.getByText('Sin datos en el período seleccionado.')).toBeInTheDocument();
    expect(screen.queryByTestId('deductible-tax-chart')).not.toBeInTheDocument();
  });
});
