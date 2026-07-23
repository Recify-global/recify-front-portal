import { useMemo } from 'react';
import { FileCheck2 } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartCard, ChartTooltipBox } from './ChartCard';
import { useInvoicedVsUninvoiced } from '@/hooks/use-dashboard-analytics';
import {
  ANALYTICS_COLORS,
  formatMxn,
  formatPercent,
  ticketsLabel,
} from '@/utils/dashboard-analytics';
import type { AnalyticsQuery } from '@/types/dashboard-analytics';

interface InvoicedVsUninvoicedChartProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

export function InvoicedVsUninvoicedChart({ query, enabled }: InvoicedVsUninvoicedChartProps) {
  const chart = useInvoicedVsUninvoiced(query, { enabled });
  const view = chart.data;

  const segments = useMemo(() => {
    if (!view) return [];
    return [
      { key: 'invoiced', label: 'Facturado', amount: view.invoiced.amount, count: view.invoiced.count, color: ANALYTICS_COLORS.invoiced },
      { key: 'uninvoiced', label: 'No facturado', amount: view.uninvoiced.amount, count: view.uninvoiced.count, color: ANALYTICS_COLORS.uninvoiced },
    ].filter((segment) => segment.amount > 0);
  }, [view]);

  const isEmpty = !view || view.totalAmount <= 0;

  return (
    <ChartCard
      title="Facturado vs no facturado"
      description="Cobertura de facturación por monto en el período"
      icon={<FileCheck2 size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={isEmpty}
      onRetry={() => void chart.refetch()}
      bodyClassName="min-h-[260px]"
    >
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments}
                dataKey="amount"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                strokeWidth={0}
              >
                {segments.map((segment) => (
                  <Cell key={segment.key} fill={segment.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const segment = payload[0].payload as (typeof segments)[number];
                  const ratio = view && view.totalAmount > 0 ? segment.amount / view.totalAmount : 0;
                  return (
                    <ChartTooltipBox
                      title={segment.label}
                      rows={[
                        { label: 'Monto', value: formatMxn(segment.amount), color: segment.color },
                        { label: 'Proporción', value: formatPercent(ratio) },
                        { label: 'Movimientos', value: ticketsLabel(segment.count) },
                      ]}
                    />
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {formatPercent(view?.invoicedRatio ?? 0)}
            </span>
            <span className="text-[11px] text-muted-foreground">facturado</span>
          </div>
        </div>

        <div className="w-full max-w-[200px] space-y-3">
          {segments.map((segment) => (
            <div key={segment.key} className="rounded-xl bg-secondary/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-xs font-medium text-foreground">{segment.label}</span>
              </div>
              <p className="mt-1 text-lg font-bold text-foreground tabular-nums">
                {formatMxn(segment.amount)}
              </p>
              <p className="text-[11px] text-muted-foreground">{ticketsLabel(segment.count)}</p>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
