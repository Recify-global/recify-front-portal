import type { TicketsListParams } from '@/types/ticket';
import { ENTITY_QUERY_CACHE } from '@/utils/query-cache-policy';

export const TICKET_LIST_QUERY_ROOT = 'tickets' as const;
export const TICKET_DETAIL_QUERY_ROOT = 'ticket' as const;

/** Filtros reales que cambian la respuesta de GET /tickets (sin undefined/null/''). */
export type NormalizedTicketListParams = {
  type?: TicketsListParams['type'];
  status?: TicketsListParams['status'];
  reviewStatus?: TicketsListParams['reviewStatus'];
  paymentMethod?: TicketsListParams['paymentMethod'];
  sourceId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
};

function compactString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normaliza params para query keys estables.
 * Omite vacíos; no inventa defaults que el backend no use.
 */
export function normalizeTicketListParams(
  params: TicketsListParams = {},
): NormalizedTicketListParams {
  const next: NormalizedTicketListParams = {};

  if (params.type) next.type = params.type;
  if (params.status) next.status = params.status;
  if (params.reviewStatus) next.reviewStatus = params.reviewStatus;
  if (params.paymentMethod) next.paymentMethod = params.paymentMethod;

  const sourceId = compactString(params.sourceId);
  if (sourceId) next.sourceId = sourceId;

  const category = compactString(params.category);
  if (category) next.category = category;

  const dateFrom = compactString(params.dateFrom);
  if (dateFrom) next.dateFrom = dateFrom;

  const dateTo = compactString(params.dateTo);
  if (dateTo) next.dateTo = dateTo;

  if (typeof params.page === 'number' && Number.isFinite(params.page)) {
    next.page = params.page;
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    next.limit = params.limit;
  }

  return next;
}

export const ticketKeys = {
  all: [TICKET_LIST_QUERY_ROOT] as const,
  company: (companyId: string) => [TICKET_LIST_QUERY_ROOT, companyId] as const,
  list: (companyId: string, params: TicketsListParams = {}) =>
    [TICKET_LIST_QUERY_ROOT, companyId, normalizeTicketListParams(params)] as const,
  detail: (companyId: string, ticketId: string) =>
    [TICKET_DETAIL_QUERY_ROOT, companyId, ticketId] as const,
};

export function ticketListQueryKey(companyId: string, params: TicketsListParams = {}) {
  return ticketKeys.list(companyId, params);
}

export function ticketDetailQueryKey(companyId: string, ticketId: string) {
  return ticketKeys.detail(companyId, ticketId);
}

export function ticketCompanyQueryKey(companyId: string) {
  return ticketKeys.company(companyId);
}

export const ticketQueryCacheOptions = {
  ...ENTITY_QUERY_CACHE,
} as const;
