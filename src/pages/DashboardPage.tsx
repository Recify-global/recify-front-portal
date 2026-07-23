import { useMemo, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { AppLayout } from '@/components/recify/AppLayout';
import { DateRangeControl } from '@/components/recify/dashboard/DateRangeControl';
import { AnalyticsKpiStrip } from '@/components/recify/dashboard/AnalyticsKpiStrip';
import { CashFlowChart } from '@/components/recify/dashboard/CashFlowChart';
import { ExpensesByVendorChart } from '@/components/recify/dashboard/ExpensesByVendorChart';
import { InvoicedVsUninvoicedChart } from '@/components/recify/dashboard/InvoicedVsUninvoicedChart';
import { DeductibleTaxByCategoryChart } from '@/components/recify/dashboard/DeductibleTaxByCategoryChart';
import { InvoicedCategoryCorrelationChart } from '@/components/recify/dashboard/InvoicedCategoryCorrelationChart';
import { ExpensesIncomeHeatmap } from '@/components/recify/dashboard/ExpensesIncomeHeatmap';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_ANALYTICS_FILTER,
  analyticsFilterLabel,
  buildAnalyticsQuery,
  isAnalyticsFilterValid,
} from '@/utils/dashboard-analytics';
import type { AnalyticsFilter, CashFlowGroupBy } from '@/types/dashboard-analytics';

export default function DashboardPage() {
  const { companyId } = useAuth();
  const [filter, setFilter] = useState<AnalyticsFilter>(DEFAULT_ANALYTICS_FILTER);
  const [groupBy, setGroupBy] = useState<CashFlowGroupBy>('month');

  const filterValid = isAnalyticsFilterValid(filter);
  const query = useMemo(() => buildAnalyticsQuery(filter), [filter]);
  const enabled = Boolean(companyId) && filterValid;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-primary text-primary-foreground">
              <LayoutDashboard size={20} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Panel de análisis financiero</h1>
          </div>
          <p className="text-muted-foreground">
            Indicadores de gasto, facturación e IVA deducible ·{' '}
            <span className="font-medium text-foreground">{analyticsFilterLabel(filter)}</span>
          </p>
        </div>

        <DateRangeControl value={filter} onChange={setFilter} />

        <AnalyticsKpiStrip
          query={query}
          enabled={enabled}
          groupBy={groupBy}
          invalid={!filterValid}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <CashFlowChart
              query={query}
              enabled={enabled}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          </div>

          <ExpensesByVendorChart query={query} enabled={enabled} />
          <InvoicedVsUninvoicedChart query={query} enabled={enabled} />
          <DeductibleTaxByCategoryChart query={query} enabled={enabled} />
          <InvoicedCategoryCorrelationChart query={query} enabled={enabled} />

          <div className="lg:col-span-2">
            <ExpensesIncomeHeatmap query={query} enabled={enabled} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
