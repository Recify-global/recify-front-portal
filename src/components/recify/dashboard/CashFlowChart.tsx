import { Waves } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, ChartTooltipBox } from './ChartCard';
import { useCashFlow } from '@/hooks/use-dashboard-analytics';
import { ANALYTICS_COLORS, formatCompactMxn, formatMxn } from '@/utils/dashboard-analytics';
import { cn } from '@/lib/utils';
import type {
  AnalyticsQuery,
  CashFlowGroupBy,
} from '@/types/dashboard-analytics';

interface CashFlowChartProps {
  query: AnalyticsQuery;
  enabled: boolean;
  groupBy: CashFlowGroupBy;
  onGroupByChange: (next: CashFlowGroupBy) => void;
}

export function CashFlowChart({ query, enabled, groupBy, onGroupByChange }: CashFlowChartProps) {
  const chart = useCashFlow(query, groupBy, { enabled });
  const view = chart.data;
  const buckets = view?.buckets ?? [];

  return (
    <ChartCard
      title="Flujo de caja"
      description="Ingresos, egresos y balance neto por período"
      icon={<Waves size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={buckets.length === 0}
      onRetry={() => void chart.refetch()}
      actions={
        <div className="inline-flex rounded-xl border border-border bg-secondary/50 p-0.5">
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onGroupByChange(option)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                groupBy === option
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'week' ? 'Semanal' : 'Mensual'}
            </button>
          ))}
        </div>
      }
      highlight={
        view ? (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: ANALYTICS_COLORS.income }}>
                {formatMxn(view.totalIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Egresos</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: ANALYTICS_COLORS.expense }}>
                {formatMxn(view.totalExpense)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance neto</p>
              <p
                className={cn(
                  'text-lg font-bold tabular-nums',
                  view.netTotal >= 0 ? 'text-foreground' : 'text-destructive',
                )}
              >
                {formatMxn(view.netTotal)}
              </p>
            </div>
          </div>
        ) : undefined
      }
      bodyClassName="min-h-[280px]"
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={buckets} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cashflow-income" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ANALYTICS_COLORS.income} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ANALYTICS_COLORS.income} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="cashflow-expense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ANALYTICS_COLORS.expense} stopOpacity={0.32} />
              <stop offset="100%" stopColor={ANALYTICS_COLORS.expense} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={ANALYTICS_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={11}
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
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const bucket = payload[0].payload as (typeof buckets)[number];
              return (
                <ChartTooltipBox
                  title={String(label)}
                  rows={[
                    { label: 'Ingresos', value: formatMxn(bucket.income), color: ANALYTICS_COLORS.income },
                    { label: 'Egresos', value: formatMxn(bucket.expense), color: ANALYTICS_COLORS.expense },
                    { label: 'Neto', value: formatMxn(bucket.net), color: ANALYTICS_COLORS.net },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke={ANALYTICS_COLORS.income}
            strokeWidth={2}
            fill="url(#cashflow-income)"
          />
          <Area
            type="monotone"
            dataKey="expense"
            stroke={ANALYTICS_COLORS.expense}
            strokeWidth={2}
            fill="url(#cashflow-expense)"
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke={ANALYTICS_COLORS.net}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
