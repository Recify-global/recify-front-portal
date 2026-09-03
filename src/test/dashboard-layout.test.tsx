import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/pages/DashboardPage';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: 'company-a' }),
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/recify/dashboard/DateRangeControl', () => ({
  DateRangeControl: () => <div>Filtro de fechas</div>,
}));

vi.mock('@/components/recify/dashboard/AnalyticsKpiStrip', () => ({
  AnalyticsKpiStrip: () => <div>Indicadores</div>,
}));

vi.mock('@/components/recify/dashboard/CashFlowChart', () => ({
  CashFlowChart: () => <h2>Flujo de caja</h2>,
}));

vi.mock('@/components/recify/dashboard/ExpensesByVendorChart', () => ({
  ExpensesByVendorChart: () => <h2>Gastos por proveedor</h2>,
}));

vi.mock('@/components/recify/dashboard/InvoicedVsUninvoicedChart', () => ({
  InvoicedVsUninvoicedChart: () => <h2>Facturado vs no facturado</h2>,
}));

vi.mock('@/components/recify/dashboard/ExpensesIncomeHeatmap', () => ({
  ExpensesIncomeHeatmap: () => <h2>Mapa de calor de actividad</h2>,
}));

vi.mock('@/components/recify/dashboard/DeductibleTaxByCategoryChart', () => ({
  DeductibleTaxByCategoryChart: () => <h2>IVA deducible por categoría</h2>,
}));

vi.mock('@/components/recify/dashboard/InvoicedCategoryCorrelationChart', () => ({
  InvoicedCategoryCorrelationChart: () => <h2>Correlación facturación × IVA deducible</h2>,
}));

afterEach(cleanup);

describe('Dashboard analytics layout', () => {
  it('keeps every chart and places the compact priority cards first', () => {
    render(<DashboardPage />);

    const chartHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(chartHeadings.map((heading) => heading.textContent)).toEqual([
      'Flujo de caja',
      'Gastos por proveedor',
      'Facturado vs no facturado',
      'Mapa de calor de actividad',
      'IVA deducible por categoría',
      'Correlación facturación × IVA deducible',
    ]);

    const analyticsGrid = chartHeadings[0].parentElement;
    expect(analyticsGrid).toHaveClass('grid-cols-1', 'lg:grid-cols-2');
    expect(analyticsGrid?.children).toHaveLength(6);
  });
});
