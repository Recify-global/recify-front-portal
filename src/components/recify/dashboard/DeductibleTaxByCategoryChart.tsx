import { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, ChartTooltipBox } from './ChartCard';
import { useDeductibleTaxByCategory } from '@/hooks/use-dashboard-analytics';
import {
  ANALYTICS_COLORS,
  formatCompactMxn,
  formatMxn,
  ticketsLabel,
} from '@/utils/dashboard-analytics';
import type { AnalyticsQuery } from '@/types/dashboard-analytics';

const MAX_CATEGORIES = 8;

interface DeductibleTaxByCategoryChartProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

function truncate(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function DeductibleTaxByCategoryChart({
  query,
  enabled,
}: DeductibleTaxByCategoryChartProps) {
  const chart = useDeductibleTaxByCategory(query, { enabled });
  const view = chart.data;

  const rows = useMemo(() => (view?.rows ?? []).slice(0, MAX_CATEGORIES), [view]);

  return (
    <ChartCard
      title="IVA deducible por categoría"
      description="Impuesto acreditable estimado según categoría de gasto"
      icon={<Receipt size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={rows.length === 0}
      onRetry={() => void chart.refetch()}
      highlight={
        view && view.totalDeductible > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground">IVA deducible total</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatMxn(view.totalDeductible)}
            </p>
          </div>
        ) : undefined
      }
      bodyClassName="min-h-[260px]"
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={ANALYTICS_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="category"
            tickFormatter={(value: string) => truncate(value)}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={54}
            tick={{ fill: 'hsl(330 6% 35%)' }}
          />
          <YAxis
            tickFormatter={formatCompactMxn}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={52}
          />
          <Tooltip
            cursor={{ fill: 'hsl(330 30% 95%)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <ChartTooltipBox
                  title={row.category}
                  rows={[
                    { label: 'IVA deducible', value: formatMxn(row.deductibleTax), color: ANALYTICS_COLORS.deductible },
                    { label: 'Gasto base', value: formatMxn(row.amount) },
                    { label: 'Movimientos', value: ticketsLabel(row.count) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="deductibleTax" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {rows.map((row) => (
              <Cell key={row.category} fill={ANALYTICS_COLORS.deductible} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
