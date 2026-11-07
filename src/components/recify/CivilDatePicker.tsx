import { useState } from 'react';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCivilDateDisplay, isValidWireCivilDate } from '@/utils/civil-date-input';
import { cn } from '@/lib/utils';

const FIRST_YEAR = 2000;
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

interface CivilDatePickerProps {
  id: string;
  label: string;
  /** Fecha civil YYYY-MM-DD, o vacío. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date local de calendario. No pasa por UTC ni por toISOString. */
function wireToLocalDate(wire: string): Date | undefined {
  if (!isValidWireCivilDate(wire)) return undefined;
  const [year, month, day] = wire.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function localDateToWire(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Selector civil reutilizable. Solo elige y muestra una fecha;
 * la página decide la consulta.
 */
export function CivilDatePicker({
  id,
  label,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: CivilDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = wireToLocalDate(value);
  const display = selected ? formatCivilDateDisplay(value) : 'DD/MM/AAAA';
  const currentYear = new Date().getFullYear();
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const years = Array.from(
    { length: currentYear + 5 - FIRST_YEAR + 1 },
    (_, index) => FIRST_YEAR + index,
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
        {label}
      </Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(selected ?? new Date());
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid}
            aria-haspopup="dialog"
            className={cn(
              'h-10 w-full justify-start gap-2 rounded-xl border-border px-3 font-normal sm:w-[9.5rem]',
              !selected && 'text-muted-foreground',
              invalid && 'border-destructive focus-visible:ring-destructive',
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          collisionPadding={16}
          className="w-auto max-w-[calc(100vw-1.5rem)] p-0"
        >
          <div className="flex gap-2 px-3 pt-3">
            <select
              aria-label="Mes"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
              value={month.getMonth()}
              onChange={(event) => {
                const next = new Date(month.getFullYear(), Number(event.target.value), 1);
                setMonth(next);
              }}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Año"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={month.getFullYear()}
              onChange={(event) => {
                const next = new Date(Number(event.target.value), month.getMonth(), 1);
                setMonth(next);
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <Calendar
            mode="single"
            locale={es}
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onChange(localDateToWire(date));
              setOpen(false);
            }}
          />
          {selected ? (
            <div className="border-t border-border p-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full rounded-lg text-xs"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                Borrar fecha
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
