import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { BackendTicket } from '@/types/ticket';
import type { BackendInvoice, UploadInvoiceResponse } from '@/types/invoice';

export interface UploadTicketResponse {
  imageUrl: string;
  ocrText: string;
  ticket: BackendTicket;
  /** Factura CFDI auto-vinculada al guardar el ticket, o null. */
  matchedInvoice?: BackendInvoice | null;
}

export interface PreprocessResponse {
  ocrText: string;
  ticket: Record<string, unknown>;
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
  opts: { signal?: AbortSignal } = {},
): Promise<UploadTicketResponse> {
  return apiRequest<UploadTicketResponse>(endpoints.upload.ticket(companyId), {
    method: 'POST',
    formData: buildFormData(file),
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
