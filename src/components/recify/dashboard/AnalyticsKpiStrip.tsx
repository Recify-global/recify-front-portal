import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  FileCheck2,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { MetricCard } from '@/components/recify/MetricCard';
import { SkeletonCard } from '@/components/recify/SkeletonCard';
import { Button } from '@/components/ui/button';
import { useCashFlow, useInvoicedVsUninvoiced } from '@/hooks/use-dashboard-analytics';
import { formatMxn, formatPercent } from '@/utils/dashboard-analytics';
import type { AnalyticsQuery, CashFlowGroupBy } from '@/types/dashboard-analytics';

interface AnalyticsKpiStripProps {
  query: AnalyticsQuery;
  enabled: boolean;
  groupBy: CashFlowGroupBy;
  invalid: boolean;
}

export function AnalyticsKpiStrip({ query, enabled, groupBy, invalid }: AnalyticsKpiStripProps) {
  const cashFlow = useCashFlow(query, groupBy, { enabled });
  const invoiced = useInvoicedVsUninvoiced(query, { enabled });

  const loading = enabled && (cashFlow.isPending || invoiced.isPending);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} lines={1} />
        ))}
      </div>
    );
  }

  if (enabled && (cashFlow.isError || invoiced.isError)) {
    return (
      <div
        className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/20 bg-card p-5 text-center shadow-elegant"
        role="alert"
      >
        <AlertCircle size={22} className="text-destructive" />
        <p className="text-sm text-muted-foreground">
          No fue posible cargar los indicadores del período.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => void Promise.all([cashFlow.refetch(), invoiced.refetch()])}
        >
          <RefreshCw size={14} className="mr-2" />
          Reintentar
        </Button>
      </div>
    );
  }

  const fallback = invalid ? 'Rango inválido' : '—';
  const cashView = cashFlow.data;
  const invoicedView = invoiced.data;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Ingresos del período"
        value={cashView ? formatMxn(cashView.totalIncome) : fallback}
        icon={<ArrowUpCircle size={20} />}
      />
      <MetricCard
        title="Egresos del período"
        value={cashView ? formatMxn(cashView.totalExpense) : fallback}
        icon={<ArrowDownCircle size={20} />}
      />
      <MetricCard
        title="Balance neto"
        value={cashView ? formatMxn(cashView.netTotal) : fallback}
        subtitle={cashView ? 'Ingresos menos egresos' : undefined}
        icon={<Scale size={20} />}
      />
      <MetricCard
        title="Cobertura de facturación"
        value={invoicedView ? formatPercent(invoicedView.invoicedRatio) : fallback}
        subtitle={invoicedView ? 'Monto facturado sobre el total de egresos' : undefined}
        icon={<FileCheck2 size={20} />}
      />
    </div>
  );
}
