import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type {
  BackendTicket,
  TicketUpdatePayload,
  TicketsListParams,
} from '@/types/ticket';

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function listTickets(
  companyId: string,
  params: TicketsListParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<Paginated<BackendTicket>> {
  const url = `${endpoints.tickets.list(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Paginated<BackendTicket>>(url, { signal: opts.signal });
}

export async function updateTicket(
  companyId: string,
  id: string,
  payload: TicketUpdatePayload,
): Promise<BackendTicket> {
  return apiRequest<BackendTicket>(endpoints.tickets.byId(companyId, id), {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteTicket(companyId: string, id: string): Promise<void> {
  await apiRequest<void>(endpoints.tickets.byId(companyId, id), {
    method: 'DELETE',
  });
}
