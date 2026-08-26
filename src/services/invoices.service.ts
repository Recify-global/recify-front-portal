import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type {
  BackendInvoice,
  ConfirmInvoiceMatchResponse,
  InvoiceMatchCandidatesResponse,
  InvoiceMatchStatus,
  InvoicesListParams,
} from '@/types/invoice';

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function listInvoices(
  companyId: string,
  params: InvoicesListParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<Paginated<BackendInvoice>> {
  const url = `${endpoints.invoices.list(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Paginated<BackendInvoice>>(url, { signal: opts.signal });
}

export async function getInvoice(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BackendInvoice> {
  return apiRequest<BackendInvoice>(endpoints.invoices.byId(companyId, id), {
    signal: opts.signal,
  });
}

/** Recalcula sugerencias al momento. 409 si la factura ya está matcheada. */
export async function getInvoiceMatchCandidates(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<InvoiceMatchCandidatesResponse> {
  return apiRequest<InvoiceMatchCandidatesResponse>(
    endpoints.invoices.matchCandidates(companyId, id),
    { signal: opts.signal },
  );
}

export async function confirmInvoiceMatch(
  companyId: string,
  id: string,
  ticketId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ConfirmInvoiceMatchResponse> {
  return apiRequest<ConfirmInvoiceMatchResponse>(endpoints.invoices.match(companyId, id), {
    method: 'POST',
    body: { ticketId },
    signal: opts.signal,
  });
}

/** Desvincula factura y ticket (ambos lados); deja matchStatus en unmatched. */
export async function unlinkInvoiceMatch(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BackendInvoice> {
  return apiRequest<BackendInvoice>(endpoints.invoices.match(companyId, id), {
    method: 'DELETE',
    signal: opts.signal,
  });
}

/** Solo acepta missing_ticket o unmatched; 409 si la factura está matcheada. */
export async function updateInvoiceMatchStatus(
  companyId: string,
  id: string,
  matchStatus: Extract<InvoiceMatchStatus, 'missing_ticket' | 'unmatched'>,
  opts: { signal?: AbortSignal } = {},
): Promise<BackendInvoice> {
  return apiRequest<BackendInvoice>(endpoints.invoices.byId(companyId, id), {
    method: 'PATCH',
    body: { matchStatus },
    signal: opts.signal,
  });
}

export async function deleteInvoice(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  await apiRequest<void>(endpoints.invoices.byId(companyId, id), {
    method: 'DELETE',
    signal: opts.signal,
  });
}
