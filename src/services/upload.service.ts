import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { BackendTicket } from '@/types/ticket';

export interface UploadTicketResponse {
  imageUrl: string;
  ocrText: string;
  ticket: BackendTicket;
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

export async function preprocessTicket(companyId: string, file: File): Promise<PreprocessResponse> {
  return apiRequest<PreprocessResponse>(endpoints.upload.preprocess(companyId), {
    method: 'POST',
    formData: buildFormData(file),
  });
}

export async function uploadTicket(companyId: string, file: File): Promise<UploadTicketResponse> {
  return apiRequest<UploadTicketResponse>(endpoints.upload.ticket(companyId), {
    method: 'POST',
    formData: buildFormData(file),
  });
}
