import { useMemo, useState } from 'react';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import type { DashboardDatePreset } from '@/types/dashboard';

/**
 * Valores soportados por el componente. Algunos se mapean al backend usando
 * `datePreset` (los nativos del backend), otros calculan `dateFrom/dateTo`
 * desde el cliente (los que el backend no contempla).
 */
export type PeriodValue =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_15_days'
  | 'last_30_days'
  | 'last_60_days'
  | 'last_90_days'
  | 'custom';

export interface PeriodSelection {
  value: PeriodValue;
  /** Solo se setea cuando el preset es nativo del backend. */
  datePreset?: DashboardDatePreset;
  /** ISO. Solo se setea cuando hace falta calcular el rango en cliente o es custom. */
  dateFrom?: string;
  dateTo?: string;
}

interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (selection: PeriodSelection) => void;
  customRange?: { from?: Date; to?: Date };
  onCustomRangeChange?: (range: { from?: Date; to?: Date }) => void;
  className?: string;
}

interface PeriodOption {
  value: PeriodValue;
  label: string;
}

const OPTIONS: PeriodOption[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'last_15_days', label: 'Últimos 15 días' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'last_60_days', label: 'Últimos 60 días' },
  { value: 'last_90_days', label: 'Últimos 90 días' },
  { value: 'custom', label: 'Rango personalizado' },
];

/**
 * Convierte un PeriodValue a la selección que el backend espera:
 * - Si el backend soporta el preset nativamente, se devuelve solo `datePreset`.
 * - Si no (15 y 60 días), se calculan `dateFrom/dateTo`.
 */
export function buildPeriodSelection(
  value: PeriodValue,
  customRange?: { from?: Date; to?: Date },
): PeriodSelection {
  switch (value) {
    case 'today':
      return { value, datePreset: 'today' };
    case 'yesterday':
      return { value, datePreset: 'yesterday' };
    case 'last_7_days':
      return { value, datePreset: 'last_7_days' };
    case 'last_30_days':
      return { value, datePreset: 'last_30_days' };
    case 'last_90_days':
      return { value, datePreset: 'last_90_days' };
    case 'last_15_days':
      return { value, ...computeRange(15) };
    case 'last_60_days':
      return { value, ...computeRange(60) };
    case 'custom': {
      if (!customRange?.from) return { value };
      const from = startOfDay(customRange.from);
      const to = endOfDay(customRange.to ?? customRange.from);
      return { value, dateFrom: from.toISOString(), dateTo: to.toISOString() };
    }
  }
}

function computeRange(days: number): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function PeriodFilter({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
  className,
}: PeriodFilterProps) {
  const [openCalendar, setOpenCalendar] = useState(false);
  const isCustom = value === 'custom';

  const customLabel = useMemo(() => {
    if (!customRange?.from) return 'Selecciona fechas';
    const fromLabel = format(customRange.from, "d MMM yyyy", { locale: es });
    if (!customRange.to || customRange.to.getTime() === customRange.from.getTime()) {
      return fromLabel;
    }
    return `${fromLabel} — ${format(customRange.to, 'd MMM yyyy', { locale: es })}`;
  }, [customRange]);

  const handleSelectChange = (next: string) => {
    const nextValue = next as PeriodValue;
    onChange(buildPeriodSelection(nextValue, customRange));
    if (nextValue === 'custom') {
      setOpenCalendar(true);
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    const next = { from: range?.from, to: range?.to };
    onCustomRangeChange?.(next);
    if (next.from && next.to) {
      onChange(buildPeriodSelection('custom', next));
      setOpenCalendar(false);
    }
  };

  const handleClearCustom = () => {
    onCustomRangeChange?.({ from: undefined, to: undefined });
    onChange(buildPeriodSelection('last_30_days'));
  };

  return (
    <div className={cn('flex flex-col sm:flex-row gap-2', className)}>
      <Select value={value} onValueChange={handleSelectChange}>
        <SelectTrigger className="w-full sm:w-52 h-10 rounded-xl border-border">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustom && (
        <div className="flex gap-2">
          <Popover open={openCalendar} onOpenChange={setOpenCalendar}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-10 rounded-xl justify-start text-left font-normal',
                  !customRange?.from && 'text-muted-foreground',
                )}
              >
                <CalendarIcon size={16} className="mr-2" />
                {customLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customRange?.from ? (customRange as DateRange) : undefined}
                onSelect={handleRangeSelect}
                numberOfMonths={2}
                locale={es}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {customRange?.from && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearCustom}
              aria-label="Limpiar rango"
              className="h-10 w-10 rounded-xl"
            >
              <X size={16} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
