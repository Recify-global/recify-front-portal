import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmInvoiceMatch,
  deleteInvoice,
  getInvoice,
  getInvoiceMatchCandidates,
  listInvoices,
  unlinkInvoiceMatch,
  updateInvoiceMatchStatus,
} from '@/services/invoices.service';
import { uploadInvoice } from '@/services/upload.service';
import type { InvoicesListParams } from '@/types/invoice';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { shouldRetryInvoiceQuery } from '@/utils/invoice-errors';
import {
  invalidateInvoiceQueries,
  invoiceDetailQueryKey,
  invoiceListQueryKey,
  invoiceQueryCacheOptions,
  normalizeInvoiceListParams,
  removeInvoiceFromCache,
  writeInvoiceCache,
} from '@/utils/invoice-queries';
import { useAuth } from './use-auth';

function requireCompanyId(companyId: string): void {
  if (!companyId) {
    throw new Error('No hay compañía activa.');
  }
}

const invoiceQueryOptions = {
  ...invoiceQueryCacheOptions,
  retry: shouldRetryInvoiceQuery,
};

export function useInvoices(params: InvoicesListParams = {}) {
  const { companyId } = useAuth();
  const normalized = normalizeInvoiceListParams(params);
  return useQuery({
    queryKey: invoiceListQueryKey(companyId ?? '', params),
    queryFn: ({ signal }) => listInvoices(companyId as string, normalized, { signal }),
    enabled: Boolean(companyId),
    ...invoiceQueryOptions,
    // Sin placeholderData cross-key: evita mostrar datos de otra compañía/filtro.
  });
}

/**
 * Detalle ligado a compañía de la selección.
 * No habilitar si `selection.companyId !== activeCompanyId`.
 */
export function useInvoice(
  selection: { companyId: string; invoiceId: string } | null | undefined,
) {
  const { companyId: activeCompanyId } = useAuth();
  const companyId = selection?.companyId;
  const invoiceId = selection?.invoiceId;
  const enabled =
    Boolean(companyId) &&
    Boolean(invoiceId) &&
    Boolean(activeCompanyId) &&
    companyId === activeCompanyId;

  return useQuery({
    queryKey: invoiceDetailQueryKey(companyId ?? '', invoiceId ?? ''),
    queryFn: ({ signal }) => getInvoice(companyId as string, invoiceId as string, { signal }),
    enabled,
    ...invoiceQueryOptions,
    retry: (failureCount, error) => shouldRetryInvoiceQuery(failureCount, error),
  });
}

export function useUploadInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      file,
      signal,
    }: {
      companyId: string;
      file: File;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return uploadInvoice(companyId, file, { signal });
    },
    onSuccess: async (data, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      writeInvoiceCache(queryClient, companyId, data.invoice);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateInvoiceQueries(queryClient, companyId, {
        invoiceId: data.invoice._id,
      });
    },
  });
}

/**
 * Recalcula candidatos bajo demanda (GET modelado como mutación).
 * Captura companyId de origen en variables.
 */
export function useRecalculateMatchCandidates() {
  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      invoiceId,
      signal,
    }: {
      companyId: string;
      invoiceId: string;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return getInvoiceMatchCandidates(companyId, invoiceId, { signal });
    },
  });
}

export function useConfirmInvoiceMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      invoiceId,
      ticketId,
      signal,
    }: {
      companyId: string;
      invoiceId: string;
      ticketId: string;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return confirmInvoiceMatch(companyId, invoiceId, ticketId, { signal });
    },
    onSuccess: async (data, { companyId, invoiceId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      writeInvoiceCache(queryClient, companyId, data.invoice);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateInvoiceQueries(queryClient, companyId, { invoiceId });
    },
  });
}

export function useUnlinkInvoiceMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      invoiceId,
      signal,
    }: {
      companyId: string;
      invoiceId: string;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return unlinkInvoiceMatch(companyId, invoiceId, { signal });
    },
    onSuccess: async (data, { companyId, invoiceId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      writeInvoiceCache(queryClient, companyId, data);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateInvoiceQueries(queryClient, companyId, { invoiceId });
    },
  });
}

export function useUpdateInvoiceMatchStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      invoiceId,
      matchStatus,
      signal,
    }: {
      companyId: string;
      invoiceId: string;
      matchStatus: 'missing_ticket' | 'unmatched';
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return updateInvoiceMatchStatus(companyId, invoiceId, matchStatus, { signal });
    },
    onSuccess: async (data, { companyId, invoiceId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      writeInvoiceCache(queryClient, companyId, data);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateInvoiceQueries(queryClient, companyId, { invoiceId });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      invoiceId,
      signal,
    }: {
      companyId: string;
      invoiceId: string;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return deleteInvoice(companyId, invoiceId, { signal });
    },
    onSuccess: async (_data, { companyId, invoiceId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      removeInvoiceFromCache(queryClient, companyId, invoiceId);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateInvoiceQueries(queryClient, companyId, { invoiceId });
    },
  });
}
