import type { BackendTicket } from '@/types/ticket';
import type {
  BackendInvoice,
  BackendInvoiceType,
  InvoiceMatchReason,
  InvoiceMatchStatus,
  InvoiceTicketRef,
} from '@/types/invoice';
import { HISTORY_TIMEZONE } from '@/utils/financial-kpis';

export const INVOICE_MATCH_STATUS_LABELS: Record<InvoiceMatchStatus, string> = {
  unmatched: 'Sin ticket',
  suggested: 'Con sugerencias',
  auto: 'Vinculada automáticamente',
  confirmed: 'Vinculada',
  missing_ticket: 'Ticket faltante',
};

export const INVOICE_MATCH_REASON_LABELS: Record<InvoiceMatchReason, string> = {
  rfc: 'Mismo RFC',
  amount_exact: 'Mismo monto',
  amount_close: 'Monto similar',
  date_exact: 'Misma fecha',
  date_close: 'Fecha cercana',
  vendor_name: 'Mismo comercio',
};

export const INVOICE_TYPE_LABELS: Record<BackendInvoiceType, string> = {
  ingreso: 'Emitida (ingreso)',
  egreso: 'Recibida (gasto)',
};

/** Claves SAT de forma de pago. */
const PAYMENT_FORM_LABELS: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque',
  '03': 'Transferencia',
  '04': 'Tarjeta de crédito',
  '28': 'Tarjeta de débito',
  '99': 'Por definir',
};

export function formatInvoicePaymentForm(code: string | null | undefined): string {
  if (!code) return '—';
  const label = PAYMENT_FORM_LABELS[code];
  return label ? `${label} (${code})` : code;
}

export function formatInvoiceMatchReason(reason: string): string {
  return INVOICE_MATCH_REASON_LABELS[reason as InvoiceMatchReason] ?? reason;
}

/**
 * Las fechas llegan como medianoche de la TZ de la empresa en UTC;
 * se toma la parte de fecha resuelta en esa TZ (nunca la local del browser).
 */
export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: HISTORY_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(d);
}

/** Normaliza `ticketId` (string u objeto populado) al id plano. */
export function invoiceTicketRefId(ref: InvoiceTicketRef | undefined): string | null {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref._id ?? null;
}

/** Devuelve el ticket populado si el backend lo entregó como objeto. */
export function invoiceTicketRefObject(ref: InvoiceTicketRef | undefined): BackendTicket | null {
  if (!ref || typeof ref === 'string') return null;
  return ref;
}

export function isInvoiceLinked(invoice: Pick<BackendInvoice, 'matchStatus'>): boolean {
  return invoice.matchStatus === 'auto' || invoice.matchStatus === 'confirmed';
}

/** ≥80 es prácticamente seguro según el matcher (score 0–105). */
export function isHighConfidenceScore(score: number): boolean {
  return score >= 80;
}

export function ticketHasInvoice(ticket: Pick<BackendTicket, 'invoiceId'>): boolean {
  return Boolean(ticket.invoiceId);
}

/** Acepta únicamente URLs HTTPS absolutas para PDFs firmados. */
export function resolveInvoiceFileUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
