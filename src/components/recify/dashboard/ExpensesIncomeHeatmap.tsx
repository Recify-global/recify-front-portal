import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { useExpensesIncomeHeatmap } from '@/hooks/use-dashboard-analytics';
import { ANALYTICS_COLORS, formatMxn } from '@/utils/dashboard-analytics';
import { cn } from '@/lib/utils';
import type { AnalyticsQuery, HeatmapDay } from '@/types/dashboard-analytics';

type HeatMetric = 'expense' | 'income';

interface ExpensesIncomeHeatmapProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

interface HeatCell {
  date: string;
  day: HeatmapDay | null;
}

const WEEKDAY_LABELS = ['Lun', '', 'Mié', '', 'Vie', '', 'Dom'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function parseUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Índice de día con semana iniciando en lunes (0=Lun .. 6=Dom). */
function mondayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** Organiza los días en columnas semanales (estilo GitHub). */
function buildWeeks(days: HeatmapDay[]): HeatCell[][] {
  if (days.length === 0) return [];
  const byDate = new Map(days.map((day) => [day.date, day]));

  const start = parseUtc(days[0].date);
  start.setUTCDate(start.getUTCDate() - mondayIndex(start));
  const end = parseUtc(days[days.length - 1].date);
  end.setUTCDate(end.getUTCDate() + (6 - mondayIndex(end)));

  const weeks: HeatCell[][] = [];
  let current: HeatCell[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const key = toKey(cursor);
    current.push({ date: key, day: byDate.get(key) ?? null });
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (current.length > 0) weeks.push(current);
  return weeks;
}

export function ExpensesIncomeHeatmap({ query, enabled }: ExpensesIncomeHeatmapProps) {
  const [metric, setMetric] = useState<HeatMetric>('expense');
  const chart = useExpensesIncomeHeatmap(query, { enabled });
  const view = chart.data;

  const weeks = useMemo(() => buildWeeks(view?.days ?? []), [view]);
  const baseColor = metric === 'expense' ? ANALYTICS_COLORS.expense : ANALYTICS_COLORS.income;
  const max = metric === 'expense' ? view?.maxExpense ?? 0 : view?.maxIncome ?? 0;

  const monthColumns = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, index) => {
      const firstWithDate = week.find((cell) => cell.day) ?? week[0];
      const month = parseUtc(firstWithDate.date).getUTCMonth();
      if (month !== lastMonth) {
        labels.push({ index, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  const cellColor = (cell: HeatCell): string => {
    const value = cell.day ? (metric === 'expense' ? cell.day.expense : cell.day.income) : 0;
    if (value <= 0 || max <= 0) return 'hsl(330 30% 94%)';
    const intensity = 0.18 + 0.82 * Math.min(1, value / max);
    return baseColor.replace(')', ` / ${intensity.toFixed(2)})`);
  };

  return (
    <ChartCard
      title="Mapa de calor de actividad"
      description="Intensidad diaria de gastos e ingresos en el período"
      icon={<CalendarDays size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={weeks.length === 0}
      onRetry={() => void chart.refetch()}
      actions={
        <div className="inline-flex rounded-xl border border-border bg-secondary/50 p-0.5">
          <button
            type="button"
            onClick={() => setMetric('expense')}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
              metric === 'expense'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Egresos
          </button>
          <button
            type="button"
            onClick={() => setMetric('income')}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
              metric === 'income'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Ingresos
          </button>
        </div>
      }
      highlight={
        view ? (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Egresos del período</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatMxn(view.totalExpense)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ingresos del período</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatMxn(view.totalIncome)}
              </p>
            </div>
          </div>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <span>Menos</span>
          {[0.18, 0.4, 0.6, 0.8, 1].map((intensity) => (
            <span
              key={intensity}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: baseColor.replace(')', ` / ${intensity})`) }}
            />
          ))}
          <span>Más</span>
        </div>
      }
    >
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5 min-w-full">
          <div className="flex gap-[3px] pl-9">
            {weeks.map((_, index) => {
              const label = monthColumns.find((m) => m.index === index);
              return (
                <div key={index} className="w-[14px] text-[10px] text-muted-foreground">
                  {label ? label.label : ''}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-9 flex-col gap-[3px] pr-1">
              {WEEKDAY_LABELS.map((label, index) => (
                <div key={index} className="h-[14px] text-[10px] leading-[14px] text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {week.map((cell) => {
                  const value = cell.day
                    ? metric === 'expense'
                      ? cell.day.expense
                      : cell.day.income
                    : 0;
                  return (
                    <div
                      key={cell.date}
                      className="h-[14px] w-[14px] rounded-[3px] transition-transform hover:scale-125 hover:ring-2 hover:ring-ring/40"
                      style={{ backgroundColor: cellColor(cell) }}
                      title={`${cell.date} · ${formatMxn(value)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
