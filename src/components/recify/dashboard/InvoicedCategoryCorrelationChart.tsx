import { useMemo } from 'react';
import { GitCompareArrows } from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { ChartCard, ChartTooltipBox } from './ChartCard';
import { useInvoicedCategoryCorrelation } from '@/hooks/use-dashboard-analytics';
import {
  ANALYTICS_COLORS,
  categoricalColor,
  formatCompactMxn,
  formatMxn,
  formatInt,
  formatPercent,
} from '@/utils/dashboard-analytics';
import type { AnalyticsQuery } from '@/types/dashboard-analytics';

interface InvoicedCategoryCorrelationChartProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

export function InvoicedCategoryCorrelationChart({
  query,
  enabled,
}: InvoicedCategoryCorrelationChartProps) {
  const chart = useInvoicedCategoryCorrelation(query, { enabled });
  const view = chart.data;

  const points = useMemo(
    () =>
      (view?.rows ?? []).map((row, index) => ({
        ...row,
        color: categoricalColor(index),
        z: Math.max(1, row.totalCount),
      })),
    [view],
  );

  return (
    <ChartCard
      title="Correlación facturación × IVA deducible"
      description="Cada categoría según su monto facturado y su IVA acreditable"
      icon={<GitCompareArrows size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={points.length === 0}
      onRetry={() => void chart.refetch()}
      bodyClassName="min-h-[260px]"
      footer={
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {points.slice(0, 6).map((point) => (
            <span key={point.category} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: point.color }} />
              {point.category}
            </span>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
          <CartesianGrid stroke={ANALYTICS_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="invoicedAmount"
            name="Facturado"
            tickFormatter={formatCompactMxn}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            label={{ value: 'Monto facturado', position: 'insideBottom', offset: -4, fontSize: 11, fill: 'hsl(330 6% 45%)' }}
          />
          <YAxis
            type="number"
            dataKey="deductibleTax"
            name="IVA deducible"
            tickFormatter={formatCompactMxn}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={52}
          />
          <ZAxis type="number" dataKey="z" range={[80, 520]} name="Movimientos" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof points)[number];
              return (
                <ChartTooltipBox
                  title={point.category}
                  rows={[
                    { label: 'Facturado', value: formatMxn(point.invoicedAmount), color: point.color },
                    { label: 'IVA deducible', value: formatMxn(point.deductibleTax) },
                    { label: '% facturado', value: formatPercent(point.invoicedRatio) },
                    { label: 'Movimientos', value: formatInt(point.totalCount) },
                  ]}
                />
              );
            }}
          />
          <Scatter data={points} fillOpacity={0.75}>
            {points.map((point) => (
              <Cell key={point.category} fill={point.color} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
