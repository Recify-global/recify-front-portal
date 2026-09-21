import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { BackendBalance } from '@/types/balance';
import type { BackendInvoice, UploadInvoiceResponse } from '@/types/invoice';
import type { BackendTicket, PreprocessPreview, TicketDraftOverrides } from '@/types/ticket';

/**
 * El upload de tickets clasifica la imagen: una transacción (ticket fiscal o
 * transferencia) devuelve `kind:'ticket'`; una captura de saldo bancario/tarjeta
 * devuelve `kind:'balance'`. Respuestas viejas sin `kind` se tratan como ticket.
 */
export interface UploadTicketResult {
  kind?: 'ticket';
  imageUrl: string;
  ocrText: string;
  ticket: BackendTicket;
  /** Siempre null: el enlace a facturas lo confirma el usuario, nunca es automático. */
  matchedInvoice?: BackendInvoice | null;
}

export interface UploadBalanceResult {
  kind: 'balance';
  imageUrl: string;
  ocrText: string;
  balance: BackendBalance;
}

export type UploadTicketResponse = UploadTicketResult | UploadBalanceResult;

export interface PreprocessResponse {
  ocrText: string;
  ticket: PreprocessPreview;
}

function buildFormData(file: File): FormData {
  const fd = new FormData();
  fd.append('image', file);
  return fd;
}

export async function preprocessTicket(
  companyId: string,
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<PreprocessResponse> {
  return apiRequest<PreprocessResponse>(endpoints.upload.preprocess(companyId), {
    method: 'POST',
    formData: buildFormData(file),
    signal: opts.signal,
  });
}

export async function uploadTicket(
  companyId: string,
  file: File,
  opts: { signal?: AbortSignal; ticketDraft?: TicketDraftOverrides } = {},
): Promise<UploadTicketResponse> {
  const fd = buildFormData(file);
  if (opts.ticketDraft) {
    fd.append('ticketDraft', JSON.stringify(opts.ticketDraft));
  }
  return apiRequest<UploadTicketResponse>(endpoints.upload.ticket(companyId), {
    method: 'POST',
    formData: fd,
    signal: opts.signal,
  });
}

export async function uploadInvoice(
  companyId: string,
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<UploadInvoiceResponse> {
  // A diferencia del ticket (campo `image`), la factura viaja en el campo `file`.
  const fd = new FormData();
  fd.append('file', file);
  return apiRequest<UploadInvoiceResponse>(endpoints.upload.invoice(companyId), {
    method: 'POST',
    formData: fd,
    signal: opts.signal,
  });
}
