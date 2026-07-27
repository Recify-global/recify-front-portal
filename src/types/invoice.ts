import type { BackendTicket } from '@/types/ticket';

export type BackendInvoiceType = 'ingreso' | 'egreso';

export type InvoiceMatchStatus =
  | 'unmatched'
  | 'suggested'
  | 'auto'
  | 'confirmed'
  | 'missing_ticket';

export type InvoiceMatchReason =
  | 'rfc'
  | 'amount_exact'
  | 'amount_close'
  | 'date_exact'
  | 'date_close'
  | 'vendor_name';

/**
 * En listado `ticketId` viene como string; en detalle y en los candidatos
 * recalculados viene populado como objeto ticket.
 */
export type InvoiceTicketRef = string | BackendTicket | null;

export interface InvoiceMatchCandidate {
  ticketId: InvoiceTicketRef;
  score: number;
  reasons: InvoiceMatchReason[];
  /** GET /match-candidates entrega el ticket populado aparte. */
  ticket?: BackendTicket | null;
}

export interface BackendInvoice {
  _id: string;
  /** Folio fiscal; puede ser null si el OCR no lo leyó. */
  uuid: string | null;
  type: BackendInvoiceType;
  issuerRfc: string | null;
  issuerName: string | null;
  receiverRfc: string | null;
  receiverName: string | null;
  date: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  /** Clave SAT de forma de pago (01, 02, 03, 04, 28, 99…). */
  paymentForm: string | null;
  /** PUE / PPD. */
  paymentMethod: string | null;
  /** URL firmada, válida 1 hora. No cachear más allá. */
  fileUrl: string;
  ticketId: InvoiceTicketRef;
  matchStatus: InvoiceMatchStatus;
  matchCandidates: InvoiceMatchCandidate[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceMatchResult {
  status: InvoiceMatchStatus;
  ticket: BackendTicket | null;
  candidates: InvoiceMatchCandidate[];
}

export interface UploadInvoiceResponse {
  fileUrl: string;
  ocrText: string;
  invoice: BackendInvoice;
  match: InvoiceMatchResult;
}

export interface InvoicesListParams {
  matchStatus?: InvoiceMatchStatus;
  type?: BackendInvoiceType;
  issuerRfc?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface InvoiceMatchCandidatesResponse {
  candidates: InvoiceMatchCandidate[];
}

export interface ConfirmInvoiceMatchResponse {
  invoice: BackendInvoice;
  ticket: BackendTicket;
}
