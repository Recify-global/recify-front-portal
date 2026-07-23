import { useMemo } from 'react';
import { CalendarRange, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ANALYTICS_DATE_PRESETS,
  isAnalyticsFilterValid,
  resolveAnalyticsRange,
} from '@/utils/dashboard-analytics';
import type { AnalyticsDatePreset, AnalyticsFilter } from '@/types/dashboard-analytics';

interface DateRangeControlProps {
  value: AnalyticsFilter;
  onChange: (next: AnalyticsFilter) => void;
}

export function DateRangeControl({ value, onChange }: DateRangeControlProps) {
  // Rango visible en los inputs: el personalizado, o la resolución del preset.
  const displayRange = useMemo(() => resolveAnalyticsRange(value), [value]);
  const activePreset = value.mode === 'preset' ? value.preset : null;
  const isCustom = value.mode === 'custom';
  const invalid = !isAnalyticsFilterValid(value);

  const handlePreset = (preset: AnalyticsDatePreset) => {
    onChange({ mode: 'preset', preset });
  };

  const handleDateChange = (edge: 'from' | 'to', raw: string) => {
    const base = {
      dateFrom: displayRange.dateFrom,
      dateTo: displayRange.dateTo,
    };
    if (edge === 'from') base.dateFrom = raw;
    else base.dateTo = raw;
    onChange({ mode: 'custom', dateFrom: base.dateFrom, dateTo: base.dateTo });
  };

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-elegant p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarRange size={16} className="text-primary" />
            Período de análisis
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Rangos rápidos de fecha">
            {ANALYTICS_DATE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={activePreset === preset.id ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => handlePreset(preset.id)}
                aria-pressed={activePreset === preset.id}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1.5 w-full sm:w-40">
            <Label htmlFor="analytics-date-from" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="analytics-date-from"
              type="date"
              value={displayRange.dateFrom}
              max={displayRange.dateTo || undefined}
              onChange={(e) => handleDateChange('from', e.target.value)}
              className={cn('h-10 rounded-xl border-border', invalid && 'border-destructive')}
            />
          </div>
          <div className="space-y-1.5 w-full sm:w-40">
            <Label htmlFor="analytics-date-to" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="analytics-date-to"
              type="date"
              value={displayRange.dateTo}
              min={displayRange.dateFrom || undefined}
              onChange={(e) => handleDateChange('to', e.target.value)}
              className={cn('h-10 rounded-xl border-border', invalid && 'border-destructive')}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
          <Sparkles size={12} className="text-primary" />
          {isCustom ? 'Rango personalizado' : 'Preset'}
        </span>
        <span className="tabular-nums">
          {displayRange.dateFrom} → {displayRange.dateTo}
        </span>
        {invalid && (
          <span className="text-destructive">
            La fecha inicial no puede ser posterior a la final.
          </span>
        )}
      </div>
    </div>
  );
}
