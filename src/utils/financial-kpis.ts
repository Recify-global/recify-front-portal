import type { BackendPaymentMethod } from '@/types/ticket';

export const HISTORY_TIMEZONE = 'America/Chihuahua';

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

export interface PaymentMethodCountInput {
  paymentMethod: string | null | undefined;
  count: number;
}

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
 * Calcula el método más usado por cantidad de movimientos.
 * Excluye other/null/undefined/vacío del ganador; los cuenta como "Sin especificar".
 */
export function resolveMostUsedPaymentMethod(
  rows: PaymentMethodCountInput[],
): PaymentMethodKpiResult {
  let unspecifiedCount = 0;
  const identified = new Map<BackendPaymentMethod, number>();

  for (const row of rows) {
    const count = Number.isFinite(row.count) && row.count > 0 ? Math.trunc(row.count) : 0;
    if (count <= 0) continue;

    const raw = typeof row.paymentMethod === 'string' ? row.paymentMethod.trim() : '';
    if (!raw || raw === 'other' || !isIdentifiedPaymentMethod(raw)) {
      unspecifiedCount += count;
      continue;
    }
    identified.set(raw, (identified.get(raw) ?? 0) + count);
  }

  const identifiedTotal = Array.from(identified.values()).reduce((a, b) => a + b, 0);
  const unspecifiedDetail =
    unspecifiedCount > 0
      ? `${unspecifiedCount} movimiento${unspecifiedCount === 1 ? '' : 's'} sin especificar`
      : null;

  if (identifiedTotal === 0) {
    if (unspecifiedCount > 0) {
      return {
        kind: 'unspecified-only',
        title: 'Sin especificar',
        subtitle: unspecifiedDetail ?? 'Sin movimientos identificados',
        unspecifiedDetail: null,
        winners: [],
        identifiedTotal: 0,
        unspecifiedCount,
      };
    }
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

  let max = 0;
  for (const count of identified.values()) {
    if (count > max) max = count;
  }

  const winners = (['card', 'cash', 'transfer'] as const).filter(
    (method) => (identified.get(method) ?? 0) === max,
  );

  if (winners.length === 1) {
    const winner = winners[0];
    const count = identified.get(winner) ?? 0;
    const pct = Math.round((count / identifiedTotal) * 100);
    return {
      kind: 'winner',
      title: PAYMENT_METHOD_LABELS[winner],
      subtitle: `${count} movimiento${count === 1 ? '' : 's'} · ${pct}%`,
      unspecifiedDetail,
      winners,
      identifiedTotal,
      unspecifiedCount,
    };
  }

  const labels = winners.map((m) => PAYMENT_METHOD_LABELS[m]);
  const tieLabel =
    labels.length === 2
      ? `${labels[0]} y ${labels[1]}`
      : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;

  return {
    kind: 'tie',
    title: 'Empate',
    subtitle: tieLabel,
    unspecifiedDetail,
    winners,
    identifiedTotal,
    unspecifiedCount,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Fecha civil YYYY-MM-DD en America/Chihuahua para un instante dado.
 */
export function civilDateInTimeZone(date: Date, timeZone = HISTORY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

/**
 * Inicio del día civil (00:00:00.000) en America/Chihuahua como ISO UTC.
 * Chihuahua observa UTC-6 fijo (sin DST).
 */
export function startOfCivilDayIso(dateKey: string, timeZone = HISTORY_TIMEZONE): string {
  if (timeZone !== HISTORY_TIMEZONE) {
    // Solo soportamos el timezone temporal del ticket.
  }
  return `${dateKey}T00:00:00.000-06:00`;
}

/** Fin del día civil (23:59:59.999) en America/Chihuahua como ISO UTC. */
export function endOfCivilDayIso(dateKey: string, timeZone = HISTORY_TIMEZONE): string {
  if (timeZone !== HISTORY_TIMEZONE) {
    // Solo soportamos el timezone temporal del ticket.
  }
  return `${dateKey}T23:59:59.999-06:00`;
}

export type DatePreset = 'last_30_days' | 'last_12_months' | null;

function shiftCivilDays(dateKey: string, days: number): string {
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

/**
 * Últimos 30 días incluyendo hoy (hoy − 29 días → hoy).
 */
export function last30DaysRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const toKey = civilDateInTimeZone(now);
  const fromKey = shiftCivilDays(toKey, -29);
  return { dateFrom: fromKey, dateTo: toKey };
}

/**
 * Últimos 12 meses incluyendo hoy (rango móvil).
 */
export function last12MonthsRange(now = new Date()): { dateFrom: string; dateTo: string } {
  const toKey = civilDateInTimeZone(now);
  const fromKey = shiftCivilMonths(toKey, -12);
  return { dateFrom: fromKey, dateTo: toKey };
}

export function detectActivePreset(
  dateFrom: string,
  dateTo: string,
  now = new Date(),
): DatePreset {
  const month = last30DaysRange(now);
  if (dateFrom === month.dateFrom && dateTo === month.dateTo) return 'last_30_days';
  const year = last12MonthsRange(now);
  if (dateFrom === year.dateFrom && dateTo === year.dateTo) return 'last_12_months';
  return null;
}

export function isValidDateRange(dateFrom: string, dateTo: string): boolean {
  if (!dateFrom || !dateTo) return true;
  return dateFrom <= dateTo;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
