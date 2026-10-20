import type { BackendPaymentMethod } from '@/types/ticket';

export const HISTORY_TIMEZONE = 'America/Chihuahua';

/** Fallback central cuando la compañía no expone un timezone IANA válido. */
export function resolveCompanyTimeZone(timeZone?: string | null): string {
  const trimmed = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!trimmed) return HISTORY_TIMEZONE;
  try {
    // Valida el IANA sin depender del offset actual.
    Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return HISTORY_TIMEZONE;
  }
}

export const mxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

export function formatMxn(amount: number): string {
  return mxnFormatter.format(amount);
}

/** Estados excluidos de KPIs financieros (regla de producto). */
export function isKpiExcludedStatus(status: string | null | undefined): boolean {
  return status === 'duplicate' || status === 'failed';
}

export function isIdentifiedPaymentMethod(
  method: string | null | undefined,
): method is BackendPaymentMethod {
  return method === 'card' || method === 'cash' || method === 'transfer';
}

export const PAYMENT_METHOD_LABELS: Record<BackendPaymentMethod, string> = {
  card: 'Tarjeta',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
};

export interface PaymentMethodKpiResult {
  kind: 'empty' | 'winner' | 'tie' | 'unspecified-only';
  /** Etiqueta principal (método, "Empate" o "Sin movimientos"). */
  title: string;
  /** Detalle bajo el título. */
  subtitle: string;
  /** Detalle secundario opcional (movimientos sin especificar). */
  unspecifiedDetail: string | null;
  winners: BackendPaymentMethod[];
  identifiedTotal: number;
  unspecifiedCount: number;
}

/**
 * Convierte el `topPaymentMethod` del endpoint /dashboard/kpis (un solo
 * ganador ya calculado por backend) al formato de la card.
 * Valores posibles del backend: card, cash, transfer, other, o null sin tickets.
 */
export function paymentMethodKpiFromTop(
  top: { paymentMethod: string | null | undefined; count: number } | null | undefined,
): PaymentMethodKpiResult {
  const count =
    top && Number.isFinite(top.count) && top.count > 0 ? Math.trunc(top.count) : 0;

  if (!top || count <= 0) {
    return {
      kind: 'empty',
      title: 'Sin movimientos',
      subtitle: 'Período sin métodos de pago',
      unspecifiedDetail: null,
      winners: [],
      identifiedTotal: 0,
      unspecifiedCount: 0,
    };
  }

  const raw = typeof top.paymentMethod === 'string' ? top.paymentMethod.trim() : '';
  const movimientos = `${count} movimiento${count === 1 ? '' : 's'}`;

  if (isIdentifiedPaymentMethod(raw)) {
    return {
      kind: 'winner',
      title: PAYMENT_METHOD_LABELS[raw],
      subtitle: movimientos,
      unspecifiedDetail: null,
      winners: [raw],
      identifiedTotal: count,
      unspecifiedCount: 0,
    };
  }

  return {
    kind: 'unspecified-only',
    title: raw === 'other' ? PAYMENT_METHOD_LABELS.other : 'Sin especificar',
    subtitle: movimientos,
    unspecifiedDetail: null,
    winners: [],
    identifiedTotal: 0,
    unspecifiedCount: count,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Fecha civil YYYY-MM-DD en el timezone indicado (default: fallback de Histórico).
 */
export function civilDateInTimeZone(date: Date, timeZone = HISTORY_TIMEZONE): string {
  const zone = resolveCompanyTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  return `${year}-${month}-${day}`;
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second'),
  );
  return asUtc - instant.getTime();
}

function formatUtcOffset(offsetMs: number): string {
  const totalMinutes = Math.round(offsetMs / 60000);
  const sign = totalMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(totalMinutes);
  return `${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

/** Offset ISO de un reloj civil en la zona IANA. Chihuahua y Ciudad de México siguen en -06:00. */
function civilClockOffset(dateKey: string, time: string, timeZone: string): string {
  const zone = resolveCompanyTimeZone(timeZone);
  const guess = new Date(`${dateKey}T${time}Z`);
  const first = zoneOffsetMs(guess, zone);
  const instant = new Date(guess.getTime() - first);
  return formatUtcOffset(zoneOffsetMs(instant, zone));
}

/**
 * Inicio del día civil como ISO. El offset sale de la zona de la compañía,
 * no de `toISOString()`, para que `$gte` coincida con la medianoche guardada.
 */
export function startOfCivilDayIso(dateKey: string, timeZone = HISTORY_TIMEZONE): string {
  return `${dateKey}T00:00:00.000${civilClockOffset(dateKey, '00:00:00.000', timeZone)}`;
}

/** Fin del día civil como ISO, inclusive para un `$lte` sobre la medianoche guardada. */
export function endOfCivilDayIso(dateKey: string, timeZone = HISTORY_TIMEZONE): string {
  return `${dateKey}T23:59:59.999${civilClockOffset(dateKey, '23:59:59.999', timeZone)}`;
}

/**
 * Límites inclusivos para consultas que comparan con `$lte` sobre una fecha
 * guardada a medianoche de la zona. `YYYY-MM-DD` se coerciona a medianoche UTC
 * y deja fuera el último día civil.
 */
export function inclusiveCivilQueryBounds(
  dateFrom: string,
  dateTo: string,
  timeZone = HISTORY_TIMEZONE,
): { dateFrom?: string; dateTo?: string } {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  return {
    ...(from ? { dateFrom: startOfCivilDayIso(from, timeZone) } : {}),
    ...(to ? { dateTo: endOfCivilDayIso(to, timeZone) } : {}),
  };
}

export type DatePresetId =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_15_days'
  | 'last_30_days'
  | 'last_60_days'
  | 'last_90_days'
  | 'last_12_months'
  | 'all';
export type DatePreset = DatePresetId | null;

export const DATE_PRESETS: ReadonlyArray<{ id: DatePresetId; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last_7_days', label: '7 días' },
  { id: 'last_15_days', label: '15 días' },
  { id: 'last_30_days', label: '30 días' },
  { id: 'last_60_days', label: '60 días' },
  { id: 'last_90_days', label: '90 días' },
  { id: 'last_12_months', label: 'Último año' },
  { id: 'all', label: 'Todo el historial' },
];

/** Desplaza una fecha civil YYYY-MM-DD N días (calendario, sin Date local). */
export function shiftCivilDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate(),
  )}`;
}

function shiftCivilMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonthIndex = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();
  return `${targetYear}-${pad2(targetMonthIndex + 1)}-${pad2(
    Math.min(day, lastDay),
  )}`;
}

/** Rango inclusivo de N días civiles: hoy − (N − 1) días → hoy. */
export function inclusiveDaysRange(
  days: number,
  now = new Date(),
  timeZone = HISTORY_TIMEZONE,
): { dateFrom: string; dateTo: string } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('El rango debe contener al menos un día.');
  }
  const toKey = civilDateInTimeZone(now, timeZone);
  const fromKey = shiftCivilDays(toKey, -(days - 1));
  return { dateFrom: fromKey, dateTo: toKey };
}

/**
 * Últimos 12 meses incluyendo hoy (rango móvil).
 */
export function last12MonthsRange(
  now = new Date(),
  timeZone = HISTORY_TIMEZONE,
): { dateFrom: string; dateTo: string } {
  const toKey = civilDateInTimeZone(now, timeZone);
  const fromKey = shiftCivilMonths(toKey, -12);
  return { dateFrom: fromKey, dateTo: toKey };
}

export function dateRangeForPreset(
  preset: DatePresetId,
  now = new Date(),
  timeZone = HISTORY_TIMEZONE,
): { dateFrom: string; dateTo: string } {
  const zone = resolveCompanyTimeZone(timeZone);
  if (preset === 'all') return { dateFrom: '', dateTo: '' };
  if (preset === 'last_12_months') return last12MonthsRange(now, zone);
  if (preset === 'today') return inclusiveDaysRange(1, now, zone);
  if (preset === 'yesterday') {
    const today = civilDateInTimeZone(now, zone);
    const yesterday = shiftCivilDays(today, -1);
    return { dateFrom: yesterday, dateTo: yesterday };
  }
  const daysByPreset: Record<
    Exclude<DatePresetId, 'last_12_months' | 'today' | 'yesterday' | 'all'>,
    number
  > = {
    last_7_days: 7,
    last_15_days: 15,
    last_30_days: 30,
    last_60_days: 60,
    last_90_days: 90,
  };
  return inclusiveDaysRange(daysByPreset[preset], now, zone);
}

export function detectActivePreset(
  dateFrom: string,
  dateTo: string,
  now = new Date(),
  timeZone = HISTORY_TIMEZONE,
): DatePreset {
  if (!dateFrom.trim() && !dateTo.trim()) return 'all';
  const zone = resolveCompanyTimeZone(timeZone);
  for (const preset of DATE_PRESETS) {
    if (preset.id === 'all') continue;
    const range = dateRangeForPreset(preset.id, now, zone);
    if (dateFrom === range.dateFrom && dateTo === range.dateTo) return preset.id;
  }
  return null;
}

export function isValidDateRange(dateFrom: string, dateTo: string): boolean {
  if (!dateFrom || !dateTo) return true;
  return dateFrom <= dateTo;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
