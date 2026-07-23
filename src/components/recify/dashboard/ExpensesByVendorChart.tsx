import { useMemo } from 'react';
import { Store } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, ChartTooltipBox } from './ChartCard';
import { useExpensesByVendor } from '@/hooks/use-dashboard-analytics';
import {
  ANALYTICS_COLORS,
  categoricalColor,
  formatCompactMxn,
  formatMxn,
  formatPercent,
  ticketsLabel,
} from '@/utils/dashboard-analytics';
import type { AnalyticsQuery } from '@/types/dashboard-analytics';

const MAX_VENDORS = 8;

interface ExpensesByVendorChartProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

export function ExpensesByVendorChart({ query, enabled }: ExpensesByVendorChartProps) {
  const chart = useExpensesByVendor(query, { enabled });
  const view = chart.data;

  const rows = useMemo(() => (view?.rows ?? []).slice(0, MAX_VENDORS), [view]);

  return (
    <ChartCard
      title="Gastos por proveedor"
      description="Top proveedores por monto de egreso en el período"
      icon={<Store size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={rows.length === 0}
      onRetry={() => void chart.refetch()}
      highlight={
        view && view.total > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground">Gasto total del período</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatMxn(view.total)}
            </p>
          </div>
        ) : undefined
      }
      bodyClassName="min-h-[260px]"
    >
      <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 40)}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
          barCategoryGap={10}
        >
          <XAxis
            type="number"
            tickFormatter={formatCompactMxn}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="vendor"
            width={110}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tick={{ fill: 'hsl(330 6% 35%)' }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(330 30% 95%)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <ChartTooltipBox
                  title={row.vendor}
                  rows={[
                    { label: 'Gasto', value: formatMxn(row.amount), color: ANALYTICS_COLORS.expense },
                    { label: 'Participación', value: formatPercent(row.percentage) },
                    { label: 'Movimientos', value: ticketsLabel(row.count) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={26}>
            {rows.map((row, index) => (
              <Cell key={row.vendor} fill={categoricalColor(index)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
