import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';
import type {
  BackendPaymentMethod,
  BackendTicket,
  BackendTicketReviewStatus,
  BackendTicketStatus,
  BackendTicketType,
  TicketDraftOverrides,
  TicketPreview,
  UiTicket,
  UiTicketStatus,
} from '@/types/ticket';
import { formatTicketPaymentMethod, formatTicketReviewStatus, formatTicketType } from './ticket-display';
import { HISTORY_TIMEZONE, resolveCompanyTimeZone } from './financial-kpis';
import { coerceToWireCivilDate, isValidWireCivilDate } from './civil-date-input';

export interface TicketEditDraft {
  type: BackendTicketType;
  date: string;
  time: string;
  vendor: string;
  amount: string;
  category: string;
  paymentMethod: BackendPaymentMethod;
  status: BackendTicketStatus;
  reviewStatus: BackendTicketReviewStatus;
}

export type HistoryTicketEditDraft = Omit<TicketEditDraft, 'reviewStatus'> & {
  /** Draft textual del IVA (`tax`); independiente de `amount`. */
  tax: string;
};

const STATUS_LABELS: Record<BackendTicketStatus, UiTicketStatus> = {
  processed: 'analizado',
  pending: 'pendiente',
  duplicate: 'pendiente',
  failed: 'error',
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeType(value: unknown): BackendTicketType {
  return asString(value) === 'ingreso' ? 'ingreso' : 'egreso';
}

function normalizePaymentMethod(value: unknown, fallback: string): BackendPaymentMethod {
  const raw = (asString(value) ?? fallback).toLowerCase();
  if (raw === 'card' || raw.includes('tarjeta')) return 'card';
  if (raw === 'cash' || raw.includes('efectivo')) return 'cash';
  if (raw === 'transfer' || raw.includes('transfer')) return 'transfer';
  return 'other';
}

function normalizeStatus(value: unknown): BackendTicketStatus {
  const raw = asString(value);
  if (raw === 'pending' || raw === 'processed' || raw === 'failed' || raw === 'duplicate') return raw;
  return 'processed';
}

export function backendDateToInput(iso: string, timeZone = HISTORY_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const zone = resolveCompanyTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

export function backendTimeToInput(iso: string, timeZone = HISTORY_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const zone = resolveCompanyTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  return hour && minute ? `${hour}:${minute}` : '';
}

export function createDraftFromTicket(
  ticket: BackendTicket,
  timeZone = HISTORY_TIMEZONE,
): TicketEditDraft {
  return {
    type: ticket.type,
    date: backendDateToInput(ticket.date, timeZone),
    time: backendTimeToInput(ticket.date, timeZone),
    vendor: ticket.vendor ?? ticket.rawData?.vendor ?? '',
    amount: String(ticket.amount),
    category: ticket.category ?? '',
    paymentMethod: ticket.paymentMethod,
    status: ticket.status,
    reviewStatus: ticket.reviewStatus ?? 'pendiente',
  };
}

export function createDraftFromAnalyzedTicket(
  payload: Record<string, unknown> | TicketPreview | null | undefined,
  fallback: UiTicket,
): TicketEditDraft {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const rawDate = asString(raw.date) ?? asString(raw.fecha);
  const sourceDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? `${rawDate}T${fallback.hora || '00:00'}:00.000-06:00`
    : rawDate ?? `${fallback.fecha}T${fallback.hora || '00:00'}:00.000-06:00`;
  return normalizeTicketEditDraft({
    type: normalizeType(raw.type),
    date: backendDateToInput(sourceDate),
    time: backendTimeToInput(sourceDate),
    vendor: asString(raw.vendor) ?? asString(raw.comercio) ?? fallback.comercio,
    amount: String(asNumber(raw.amount) ?? asNumber(raw.total) ?? fallback.total),
    category: asString(raw.category) ?? asString(raw.categoria) ?? fallback.categoria,
    paymentMethod: normalizePaymentMethod(raw.paymentMethod ?? raw.metodoPago, fallback.metodoPago),
    status: normalizeStatus(raw.status),
    reviewStatus: raw.reviewStatus === 'revisado' ? 'revisado' : 'pendiente',
  });
}

export function applyDraftToUiTicket(ticket: UiTicket, draft: TicketEditDraft): UiTicket {
  const normalizedDraft = normalizeTicketEditDraft(draft);
  const amount = parseAmount(normalizedDraft.amount) ?? ticket.total;
  const iva = Math.min(ticket.iva, amount);

  return {
    ...ticket,
    comercio: normalizedDraft.vendor || 'Sin comercio',
    fecha: normalizedDraft.date || ticket.fecha,
    hora: normalizedDraft.time || ticket.hora,
    subtotal: Math.max(0, amount - iva),
    iva,
    total: amount,
    categoria: normalizedDraft.category || ticket.categoria,
    tipo: formatTicketType(normalizedDraft.type),
    metodoPago: formatTicketPaymentMethod(normalizedDraft.paymentMethod),
    estatus: STATUS_LABELS[normalizedDraft.status] ?? ticket.estatus,
    reviewStatus: formatTicketReviewStatus(normalizedDraft.reviewStatus),
  };
}

export function parseAmount(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Vacío → `null` (sin IVA); mismo criterio numérico que Total para valores no vacíos. */
export function parseTaxDraft(value: string): number | null | undefined {
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  return parseAmount(trimmed) ?? undefined;
}

function taxFromTicket(ticket: BackendTicket): string {
  const raw = ticket.tax ?? ticket.rawData?.tax;
  if (raw === null || raw === undefined) return '';
  const n = asNumber(raw);
  return n === null ? '' : String(n);
}

export function normalizeTicketEditDraft(draft: TicketEditDraft): TicketEditDraft {
  const amount = parseAmount(draft.amount);
  return {
    ...draft,
    amount: amount === null ? draft.amount.trim() : String(amount),
    vendor: draft.vendor.trim(),
    category: draft.category.trim(),
  };
}

function inputDateTimeToIso(dateStr: string, timeStr: string): string | null {
  const wireDate = coerceToWireCivilDate(dateStr);
  if (!wireDate || !timeStr.trim()) return null;
  if (!/^\d{2}:\d{2}$/.test(timeStr.trim())) return null;
  const d = new Date(`${wireDate}T${timeStr.trim()}:00.000-06:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type BuildPayloadResult =
  | { ok: true; payload: DashboardDailyReportTicketUpdate }
  | { ok: false; reason: 'validation'; message: string }
  | { ok: false; reason: 'no-changes' };

function validateDraft(draft: TicketEditDraft): { ok: true; amount: number; dateIso: string } | { ok: false; message: string } {
  const amount = parseAmount(draft.amount);
  if (amount === null) {
    return { ok: false, message: 'Ingresa un monto válido mayor o igual a 0.' };
  }

  const wireDate = coerceToWireCivilDate(draft.date);
  if (!wireDate) {
    return { ok: false, message: 'Ingresa una fecha válida con el formato DD/MM/AAAA.' };
  }

  const dateIso = inputDateTimeToIso(wireDate, draft.time);
  if (!dateIso) {
    return { ok: false, message: 'Ingresa una fecha y hora válidas.' };
  }
  if (draft.vendor.length > 200) {
    return { ok: false, message: 'El comercio no puede exceder 200 caracteres.' };
  }
  if (draft.category.length > 100) {
    return { ok: false, message: 'La categoría no puede exceder 100 caracteres.' };
  }

  return { ok: true, amount, dateIso };
}

export function buildTicketUpdatePayload(
  baseline: TicketEditDraft,
  draft: TicketEditDraft,
): BuildPayloadResult {
  const normalizedBaseline = normalizeTicketEditDraft(baseline);
  const normalizedDraft = normalizeTicketEditDraft(draft);
  const validation = validateDraft(normalizedDraft);
  if ('message' in validation) {
    return { ok: false, reason: 'validation', message: validation.message };
  }

  const baselineAmount = parseAmount(normalizedBaseline.amount);
  const baselineWireDate = coerceToWireCivilDate(normalizedBaseline.date);
  const draftWireDate = coerceToWireCivilDate(normalizedDraft.date);
  const payload: DashboardDailyReportTicketUpdate = {};

  if (normalizedDraft.type !== normalizedBaseline.type) payload.type = normalizedDraft.type;
  if (
    draftWireDate !== baselineWireDate ||
    normalizedDraft.time !== normalizedBaseline.time
  ) {
    payload.date = validation.dateIso;
  }
  if (validation.amount !== baselineAmount) payload.amount = validation.amount;
  if (normalizedDraft.vendor !== normalizedBaseline.vendor) payload.vendor = normalizedDraft.vendor;
  if (normalizedDraft.category !== normalizedBaseline.category) payload.category = normalizedDraft.category;
  if (normalizedDraft.paymentMethod !== normalizedBaseline.paymentMethod) payload.paymentMethod = normalizedDraft.paymentMethod;
  if (normalizedDraft.status !== normalizedBaseline.status) payload.status = normalizedDraft.status;
  if (normalizedDraft.reviewStatus !== normalizedBaseline.reviewStatus) payload.reviewStatus = normalizedDraft.reviewStatus;

  if (Object.keys(payload).length === 0) {
    return { ok: false, reason: 'no-changes' };
  }

  return { ok: true, payload };
}

export function buildDashboardUpdatePayload(
  original: BackendTicket,
  draft: TicketEditDraft,
): BuildPayloadResult {
  return buildTicketUpdatePayload(createDraftFromTicket(original), draft);
}

export function createHistoryDraftFromTicket(
  ticket: BackendTicket,
  timeZone = HISTORY_TIMEZONE,
): HistoryTicketEditDraft {
  const { reviewStatus: _reviewStatus, ...draft } = createDraftFromTicket(ticket, timeZone);
  return {
    ...draft,
    tax: taxFromTicket(ticket),
  };
}

export function buildHistoryTicketUpdatePayload(
  baseline: HistoryTicketEditDraft,
  draft: HistoryTicketEditDraft,
): BuildPayloadResult {
  const normalizedBaseline = normalizeHistoryTicketEditDraft(baseline);
  const normalizedDraft = normalizeHistoryTicketEditDraft(draft);

  const draftTax = parseTaxDraft(normalizedDraft.tax);
  if (draftTax === undefined) {
    return {
      ok: false,
      reason: 'validation',
      message: 'Ingresa un IVA válido mayor o igual a 0.',
    };
  }
  const baselineTax = parseTaxDraft(normalizedBaseline.tax);
  if (baselineTax === undefined) {
    return {
      ok: false,
      reason: 'validation',
      message: 'Ingresa un IVA válido mayor o igual a 0.',
    };
  }

  const result = buildTicketUpdatePayload(
    { ...normalizedBaseline, reviewStatus: 'pendiente' },
    { ...normalizedDraft, reviewStatus: 'pendiente' },
  );

  if (result.ok === false && result.reason === 'validation') {
    return result;
  }

  const payload: DashboardDailyReportTicketUpdate =
    result.ok === true ? { ...result.payload } : {};
  const { reviewStatus: _reviewStatus, ...withoutReview } = payload;
  const nextPayload: DashboardDailyReportTicketUpdate = { ...withoutReview };

  if (draftTax !== baselineTax) {
    nextPayload.tax = draftTax;
  }

  if (Object.keys(nextPayload).length === 0) {
    return { ok: false, reason: 'no-changes' };
  }

  return { ok: true, payload: nextPayload };
}

export function normalizeHistoryTicketEditDraft(
  draft: HistoryTicketEditDraft,
): HistoryTicketEditDraft {
  const normalized = normalizeTicketEditDraft({
    ...draft,
    reviewStatus: 'pendiente',
  });
  const { reviewStatus: _reviewStatus, ...historyDraft } = normalized;
  const parsedTax = parseTaxDraft(draft.tax);
  return {
    ...historyDraft,
    tax: parsedTax === undefined ? draft.tax.trim() : parsedTax === null ? '' : String(parsedTax),
  };
}

export function hasHistoryTicketEditChanges(
  baseline: HistoryTicketEditDraft,
  draft: HistoryTicketEditDraft,
): boolean {
  const normalizedBaseline = normalizeHistoryTicketEditDraft(baseline);
  const normalizedDraft = normalizeHistoryTicketEditDraft(draft);
  const baselineDate = coerceToWireCivilDate(normalizedBaseline.date) ?? normalizedBaseline.date;
  const draftDate = coerceToWireCivilDate(normalizedDraft.date);
  const comparableDraft = {
    ...normalizedDraft,
    date: draftDate ?? normalizedDraft.date.trim(),
  };
  const comparableBaseline = {
    ...normalizedBaseline,
    date: baselineDate,
  };
  return JSON.stringify(comparableBaseline) !== JSON.stringify(comparableDraft);
}

function isIncompleteCivilDateDraft(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (coerceToWireCivilDate(trimmed)) return false;
  // Sigue escribiendo DD/MM/AAAA (o borrando parcial).
  return true;
}

export function getHistoryTicketEditValidationMessage(
  draft: HistoryTicketEditDraft,
): string | null {
  if (isIncompleteCivilDateDraft(draft.date)) return null;
  const validation = validateDraft({ ...draft, reviewStatus: 'pendiente' });
  if ('message' in validation) return validation.message;
  if (parseTaxDraft(draft.tax) === undefined) {
    return 'Ingresa un IVA válido mayor o igual a 0.';
  }
  return null;
}

export function hasTicketEditChanges(baseline: TicketEditDraft | null, draft: TicketEditDraft | null): boolean {
  if (!baseline || !draft) return false;
  return buildTicketUpdatePayload(baseline, draft).ok;
}

export function getTicketEditValidationMessage(draft: TicketEditDraft | null): string | null {
  if (!draft) return null;
  const validation = validateDraft(draft);
  return 'message' in validation ? validation.message : null;
}

export interface BatchTicketDraft {
  type: BackendTicketType;
  date: string;
  vendor: string;
  amount: string;
  tax: string;
  category: string;
  paymentMethod: BackendPaymentMethod;
  vendorRFC: string;
}

export function createBatchDraftFromPreview(preview: TicketPreview): BatchTicketDraft {
  return {
    type: preview.type,
    date: preview.date && isValidWireCivilDate(preview.date) ? preview.date : '',
    vendor: preview.vendor ?? '',
    amount: String(preview.amount),
    tax: preview.tax == null ? '' : String(preview.tax),
    category: preview.category ?? '',
    paymentMethod: preview.paymentMethod ?? 'other',
    vendorRFC: preview.vendorRFC ?? '',
  };
}

export function normalizeBatchTicketDraft(draft: BatchTicketDraft): BatchTicketDraft {
  const amount = parseAmount(draft.amount);
  const parsedTax = parseTaxDraft(draft.tax);
  return {
    ...draft,
    vendor: draft.vendor.trim(),
    category: draft.category.trim(),
    vendorRFC: draft.vendorRFC.trim(),
    amount: amount === null ? draft.amount.trim() : String(amount),
    tax: parsedTax === undefined ? draft.tax.trim() : parsedTax === null ? '' : String(parsedTax),
    date: coerceToWireCivilDate(draft.date) ?? draft.date.trim(),
  };
}

export function getBatchTicketDraftValidationMessage(draft: BatchTicketDraft | null): string | null {
  if (!draft) return null;
  const normalized = normalizeBatchTicketDraft(draft);
  if (parseAmount(normalized.amount) === null) {
    return 'Ingresa un monto válido mayor o igual a 0.';
  }
  if (normalized.date && !coerceToWireCivilDate(normalized.date)) {
    return 'Ingresa una fecha válida.';
  }
  if (parseTaxDraft(normalized.tax) === undefined) {
    return 'Ingresa un IVA válido mayor o igual a 0.';
  }
  const amount = parseAmount(normalized.amount);
  const tax = parseTaxDraft(normalized.tax);
  if (amount != null && tax != null && tax > amount) {
    return 'El IVA no puede ser mayor que el total.';
  }
  if (normalized.vendor.length > 200) {
    return 'El comercio no puede exceder 200 caracteres.';
  }
  if (normalized.category.length > 100) {
    return 'La categoría no puede exceder 100 caracteres.';
  }
  return null;
}

export function hasBatchTicketDraftChanges(
  baseline: BatchTicketDraft | null,
  draft: BatchTicketDraft | null,
): boolean {
  if (!baseline || !draft) return false;
  return (
    JSON.stringify(normalizeBatchTicketDraft(baseline)) !==
    JSON.stringify(normalizeBatchTicketDraft(draft))
  );
}

export function buildTicketDraftOverrides(
  draft: BatchTicketDraft,
): { ok: true; payload: TicketDraftOverrides } | { ok: false; message: string } {
  const message = getBatchTicketDraftValidationMessage(draft);
  if (message) return { ok: false, message };

  const normalized = normalizeBatchTicketDraft(draft);
  const amount = parseAmount(normalized.amount);
  const tax = parseTaxDraft(normalized.tax);
  if (amount === null || tax === undefined) {
    return { ok: false, message: 'Ingresa un monto válido mayor o igual a 0.' };
  }

  const payload: TicketDraftOverrides = {
    type: normalized.type,
    amount,
    tax,
    paymentMethod: normalized.paymentMethod,
    vendor: normalized.vendor,
    category: normalized.category,
  };
  const date = coerceToWireCivilDate(normalized.date);
  if (date) payload.date = date;
  if (normalized.vendorRFC) payload.vendorRFC = normalized.vendorRFC;
  return { ok: true, payload };
}
