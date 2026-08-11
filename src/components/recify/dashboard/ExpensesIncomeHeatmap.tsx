import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { useExpensesIncomeHeatmap } from '@/hooks/use-dashboard-analytics';
import {
  ANALYTICS_COLORS,
  buildHeatmapCalendar,
  buildHeatmapThresholds,
  formatMxn,
  heatmapLevel,
} from '@/utils/dashboard-analytics';
import { cn } from '@/lib/utils';
import type { AnalyticsQuery } from '@/types/dashboard-analytics';

type HeatMetric = 'expense' | 'income';

interface ExpensesIncomeHeatmapProps {
  query: AnalyticsQuery;
  enabled: boolean;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const LEVEL_OPACITY = [0, 0.28, 0.48, 0.7, 1] as const;
const humanDateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function ExpensesIncomeHeatmap({ query, enabled }: ExpensesIncomeHeatmapProps) {
  const [metric, setMetric] = useState<HeatMetric>('expense');
  const chart = useExpensesIncomeHeatmap(query, { enabled });
  const view = chart.data;

  const weeks = useMemo(
    () => buildHeatmapCalendar(view?.days ?? [], query),
    [query, view],
  );
  const baseColor = metric === 'expense' ? ANALYTICS_COLORS.expense : ANALYTICS_COLORS.income;
  const thresholds = useMemo(
    () =>
      buildHeatmapThresholds(
        weeks.flatMap((week) =>
          week
            .filter((cell) => cell.isInRange)
            .map((cell) => (metric === 'expense' ? cell.day.expense : cell.day.income)),
        ),
      ),
    [metric, weeks],
  );

  const monthColumns = useMemo(() => {
    const labels: { index: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, index) => {
      const month = parseUtc(week[0].date).getUTCMonth();
      if (month !== lastMonth) {
        labels.push({ index, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  const cellColor = (cell: (typeof weeks)[number][number]): string => {
    if (!cell.isInRange) return 'hsl(330 20% 97%)';
    const value = metric === 'expense' ? cell.day.expense : cell.day.income;
    const level = heatmapLevel(value, thresholds);
    if (level === 0) return 'hsl(330 30% 94%)';
    return baseColor.replace(')', ` / ${LEVEL_OPACITY[level]})`);
  };

  return (
    <ChartCard
      title="Mapa de calor de actividad"
      description="Intensidad diaria de gastos e ingresos en el período"
      icon={<CalendarDays size={20} />}
      isLoading={chart.isPending && enabled}
      isError={chart.isError}
      isEmpty={!enabled && !view}
      onRetry={() => void chart.refetch()}
      className="min-w-0"
      bodyClassName="min-w-0"
      actions={
        <div className="inline-flex rounded-xl border border-border bg-secondary/50 p-0.5">
          <button
            type="button"
            onClick={() => setMetric('expense')}
            aria-pressed={metric === 'expense'}
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
            aria-pressed={metric === 'income'}
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
          <div className="grid w-full max-w-sm grid-cols-2 gap-x-4 rounded-xl bg-secondary/40 px-3 py-2.5 sm:w-fit sm:gap-x-10">
            <div>
              <p className="text-xs text-muted-foreground">Egresos del período</p>
              <p className="text-base font-bold text-foreground tabular-nums sm:text-lg">
                {formatMxn(view.totalExpense)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ingresos del período</p>
              <p className="text-base font-bold text-foreground tabular-nums sm:text-lg">
                {formatMxn(view.totalIncome)}
              </p>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="w-full overflow-x-auto pb-1" dir="rtl">
        <div className="mx-auto flex w-fit min-w-[314px] flex-col gap-2" dir="ltr">
          <div className="flex gap-1 pl-7 sm:pl-8">
            {weeks.map((_, index) => {
              const label = monthColumns.find((m) => m.index === index);
              return (
                <div
                  key={index}
                  className="w-[18px] text-[10px] text-muted-foreground sm:w-5 lg:w-[22px]"
                >
                  {label ? label.label : ''}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            <div className="flex w-7 flex-col gap-1 sm:w-8">
              {WEEKDAY_LABELS.map((label, index) => (
                <div
                  key={index}
                  className="h-[18px] pr-1 text-right text-[10px] leading-[18px] text-muted-foreground sm:h-5 sm:leading-5 lg:h-[22px] lg:leading-[22px]"
                >
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((cell) => {
                  const value = metric === 'expense' ? cell.day.expense : cell.day.income;
                  const humanDate = humanDateFormatter.format(parseUtc(cell.date));
                  const metricLabel = metric === 'expense' ? 'egresos' : 'ingresos';
                  const ticketCount = cell.day.count;
                  const ticketLabel = `${ticketCount} ticket${ticketCount === 1 ? '' : 's'}`;
                  const description = cell.isInRange
                    ? `${humanDate}, ${formatMxn(value)} MXN en ${metricLabel}, ${ticketLabel}`
                    : `${humanDate}, fuera del período seleccionado`;
                  return (
                    <div
                      key={cell.date}
                      className="h-[18px] w-[18px] rounded-[4px] transition-transform hover:scale-110 hover:ring-2 hover:ring-ring/40 sm:h-5 sm:w-5 lg:h-[22px] lg:w-[22px]"
                      style={{ backgroundColor: cellColor(cell) }}
                      role="img"
                      aria-label={description}
                      title={description}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
            <span>Menos</span>
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className="h-3.5 w-3.5 rounded-[3px] sm:h-4 sm:w-4"
                style={{
                  backgroundColor:
                    level === 0
                      ? 'hsl(330 30% 94%)'
                      : baseColor.replace(')', ` / ${LEVEL_OPACITY[level]})`),
                }}
              />
            ))}
            <span>Más</span>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
