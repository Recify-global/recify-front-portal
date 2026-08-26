import type { QueryClient } from '@tanstack/react-query';
import type { Paginated } from '@/types/api';
import type { BackendInvoice, InvoicesListParams } from '@/types/invoice';
import { ENTITY_QUERY_CACHE } from '@/utils/query-cache-policy';
import { ticketCompanyQueryKey } from '@/utils/ticket-queries';

export const INVOICE_LIST_QUERY_ROOT = 'invoices' as const;
export const INVOICE_DETAIL_QUERY_ROOT = 'invoice' as const;

export type NormalizedInvoiceListParams = {
  matchStatus?: InvoicesListParams['matchStatus'];
  type?: InvoicesListParams['type'];
  issuerRfc?: string;
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

export function normalizeInvoiceListParams(
  params: InvoicesListParams = {},
): NormalizedInvoiceListParams {
  const next: NormalizedInvoiceListParams = {};

  if (params.matchStatus) next.matchStatus = params.matchStatus;
  if (params.type) next.type = params.type;

  const issuerRfc = compactString(params.issuerRfc);
  if (issuerRfc) next.issuerRfc = issuerRfc;

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

export const invoiceKeys = {
  all: [INVOICE_LIST_QUERY_ROOT] as const,
  company: (companyId: string) => [INVOICE_LIST_QUERY_ROOT, companyId] as const,
  list: (companyId: string, params: InvoicesListParams = {}) =>
    [INVOICE_LIST_QUERY_ROOT, companyId, normalizeInvoiceListParams(params)] as const,
  detailRoot: (companyId: string) => [INVOICE_DETAIL_QUERY_ROOT, companyId] as const,
  detail: (companyId: string, invoiceId: string) =>
    [INVOICE_DETAIL_QUERY_ROOT, companyId, invoiceId] as const,
};

export function invoiceListQueryKey(companyId: string, params: InvoicesListParams = {}) {
  return invoiceKeys.list(companyId, params);
}

export function invoiceDetailQueryKey(companyId: string, invoiceId: string) {
  return invoiceKeys.detail(companyId, invoiceId);
}

export function invoiceCompanyQueryKey(companyId: string) {
  return invoiceKeys.company(companyId);
}

export const invoiceQueryCacheOptions = {
  ...ENTITY_QUERY_CACHE,
} as const;

/**
 * Invalida caché de Facturas y analítica fiscal dependiente, solo de la compañía origen.
 * No limpia el QueryClient global.
 */
export async function invalidateInvoiceQueries(
  queryClient: QueryClient,
  companyId: string,
  options: { invoiceId?: string } = {},
) {
  if (!companyId) return;

  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: invoiceKeys.company(companyId) }),
    queryClient.invalidateQueries({ queryKey: invoiceKeys.detailRoot(companyId) }),
    queryClient.invalidateQueries({ queryKey: ticketCompanyQueryKey(companyId) }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-daily-report', companyId] }),
    queryClient.invalidateQueries({
      queryKey: ['dashboard-invoiced-vs-uninvoiced', companyId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['dashboard-invoiced-category-correlation', companyId],
    }),
  ];

  if (options.invoiceId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: invoiceDetailQueryKey(companyId, options.invoiceId),
      }),
    );
  }

  await Promise.all(tasks);
}

/** Escribe el detalle y parchea la factura en listados cacheados de la misma compañía. */
export function writeInvoiceCache(
  queryClient: QueryClient,
  companyId: string,
  invoice: BackendInvoice,
) {
  queryClient.setQueryData(invoiceDetailQueryKey(companyId, invoice._id), invoice);

  const lists = queryClient.getQueriesData<Paginated<BackendInvoice>>({
    queryKey: invoiceKeys.company(companyId),
  });

  for (const [key, page] of lists) {
    if (!page?.data?.length) continue;
    const index = page.data.findIndex((row) => row._id === invoice._id);
    if (index < 0) continue;
    const nextData = page.data.slice();
    nextData[index] = { ...nextData[index], ...invoice };
    queryClient.setQueryData(key, { ...page, data: nextData });
  }
}

export function removeInvoiceFromCache(
  queryClient: QueryClient,
  companyId: string,
  invoiceId: string,
) {
  queryClient.removeQueries({ queryKey: invoiceDetailQueryKey(companyId, invoiceId) });

  const lists = queryClient.getQueriesData<Paginated<BackendInvoice>>({
    queryKey: invoiceKeys.company(companyId),
  });

  for (const [key, page] of lists) {
    if (!page?.data?.length) continue;
    if (!page.data.some((row) => row._id === invoiceId)) continue;
    const nextData = page.data.filter((row) => row._id !== invoiceId);
    queryClient.setQueryData(key, {
      ...page,
      data: nextData,
      total: Math.max(0, (page.total ?? nextData.length) - 1),
    });
  }
}
