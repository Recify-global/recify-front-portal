import type { QueryClient } from '@tanstack/react-query';
import type { Paginated } from '@/types/api';
import type { BackendInvoice } from '@/types/invoice';

export const INVOICE_LIST_QUERY_ROOT = 'invoices' as const;
export const INVOICE_DETAIL_QUERY_ROOT = 'invoice' as const;

export function invoiceListQueryKey(
  companyId: string,
  params: Record<string, unknown> = {},
) {
  return [INVOICE_LIST_QUERY_ROOT, companyId, params] as const;
}

export function invoiceDetailQueryKey(companyId: string, invoiceId: string) {
  return [INVOICE_DETAIL_QUERY_ROOT, companyId, invoiceId] as const;
}

/**
 * Invalida caché de Facturas y analítica fiscal dependiente, solo de la compañía origen.
 * No limpia el QueryClient global.
 */
export async function invalidateInvoiceQueries(
  queryClient: QueryClient,
  companyId: string,
  options: { invoiceId?: string } = {},
) {
  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({ queryKey: [INVOICE_LIST_QUERY_ROOT, companyId] }),
    queryClient.invalidateQueries({ queryKey: [INVOICE_DETAIL_QUERY_ROOT, companyId] }),
    queryClient.invalidateQueries({ queryKey: ['tickets', companyId] }),
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
    queryKey: [INVOICE_LIST_QUERY_ROOT, companyId],
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
    queryKey: [INVOICE_LIST_QUERY_ROOT, companyId],
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
