import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';
import type {
  BackendPaymentMethod,
  BackendTicket,
  BackendTicketReviewStatus,
  BackendTicketStatus,
  BackendTicketType,
  UiTicket,
  UiTicketStatus,
} from '@/types/ticket';
import { formatTicketPaymentMethod, formatTicketReviewStatus, formatTicketType } from './ticket-display';

export interface TicketEditDraft {
  type: BackendTicketType;
  date: string;
  amount: string;
  category: string;
  paymentMethod: BackendPaymentMethod;
  status: BackendTicketStatus;
  reviewStatus: BackendTicketReviewStatus;
}

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

export function backendDateToInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function createDraftFromTicket(ticket: BackendTicket): TicketEditDraft {
  return {
    type: ticket.type,
    date: backendDateToInput(ticket.date),
    amount: String(ticket.amount),
    category: ticket.category ?? '',
    paymentMethod: ticket.paymentMethod,
    status: ticket.status,
    reviewStatus: ticket.reviewStatus ?? 'pendiente',
  };
}

export function createDraftFromAnalyzedTicket(
  payload: Record<string, unknown> | null | undefined,
  fallback: UiTicket,
): TicketEditDraft {
  const raw = payload ?? {};
  return normalizeTicketEditDraft({
    type: normalizeType(raw.type),
    date: backendDateToInput(
      asString(raw.date) ?? asString(raw.fecha) ?? `${fallback.fecha}T00:00:00.000Z`,
    ),
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
    fecha: normalizedDraft.date || ticket.fecha,
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

export function normalizeTicketEditDraft(draft: TicketEditDraft): TicketEditDraft {
  const amount = parseAmount(draft.amount);
  return {
    ...draft,
    amount: amount === null ? draft.amount.trim() : String(amount),
    category: draft.category.trim(),
  };
}

function inputDateToIso(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const d = new Date(`${dateStr}T12:00:00.000Z`);
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

  const dateIso = inputDateToIso(draft.date);
  if (!dateIso) {
    return { ok: false, message: 'Ingresa una fecha válida.' };
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
  const payload: DashboardDailyReportTicketUpdate = {};

  if (normalizedDraft.type !== normalizedBaseline.type) payload.type = normalizedDraft.type;
  if (normalizedDraft.date !== normalizedBaseline.date) payload.date = validation.dateIso;
  if (validation.amount !== baselineAmount) payload.amount = validation.amount;
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

export function hasTicketEditChanges(baseline: TicketEditDraft | null, draft: TicketEditDraft | null): boolean {
  if (!baseline || !draft) return false;
  return buildTicketUpdatePayload(baseline, draft).ok;
}

export function getTicketEditValidationMessage(draft: TicketEditDraft | null): string | null {
  if (!draft) return null;
  const validation = validateDraft(draft);
  return 'message' in validation ? validation.message : null;
}
