import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import { useAuth } from './use-auth';

/**
 * El match toca ambos lados (invoice.ticketId / ticket.invoiceId), así que
 * cualquier mutación invalida facturas y tickets de la compañía.
 */
async function invalidateInvoiceQueries(queryClient: QueryClient, companyId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['invoice', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['tickets', companyId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard-daily-report', companyId] }),
  ]);
}

function requireCompany(companyId: string | null): Promise<never> | null {
  if (!companyId) {
    return Promise.reject(new Error('No hay compañía activa.'));
  }
  return null;
}

export function useInvoices(params: InvoicesListParams = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['invoices', companyId, params],
    queryFn: () => listInvoices(companyId as string, params),
    enabled: Boolean(companyId),
  });
}

export function useInvoice(id: string | null | undefined) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['invoice', companyId, id],
    queryFn: () => getInvoice(companyId as string, id as string),
    enabled: Boolean(companyId) && Boolean(id),
  });
}

export function useUploadInvoice() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file }: { file: File }) =>
      requireCompany(companyId) ?? uploadInvoice(companyId as string, file),
    onSuccess: async () => {
      if (companyId) await invalidateInvoiceQueries(queryClient, companyId);
    },
  });
}

/**
 * Recalcula candidatos bajo demanda (GET, pero modelado como mutación
 * porque se dispara con un botón y puede responder 409 si ya hay match).
 */
export function useRecalculateMatchCandidates() {
  const { companyId } = useAuth();

  return useMutation({
    mutationFn: ({ invoiceId }: { invoiceId: string }) =>
      requireCompany(companyId) ?? getInvoiceMatchCandidates(companyId as string, invoiceId),
  });
}

export function useConfirmInvoiceMatch() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, ticketId }: { invoiceId: string; ticketId: string }) =>
      requireCompany(companyId) ?? confirmInvoiceMatch(companyId as string, invoiceId, ticketId),
    onSuccess: async () => {
      if (companyId) await invalidateInvoiceQueries(queryClient, companyId);
    },
  });
}

export function useUnlinkInvoiceMatch() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId }: { invoiceId: string }) =>
      requireCompany(companyId) ?? unlinkInvoiceMatch(companyId as string, invoiceId),
    onSuccess: async () => {
      if (companyId) await invalidateInvoiceQueries(queryClient, companyId);
    },
  });
}

export function useUpdateInvoiceMatchStatus() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      invoiceId,
      matchStatus,
    }: {
      invoiceId: string;
      matchStatus: 'missing_ticket' | 'unmatched';
    }) =>
      requireCompany(companyId) ??
      updateInvoiceMatchStatus(companyId as string, invoiceId, matchStatus),
    onSuccess: async () => {
      if (companyId) await invalidateInvoiceQueries(queryClient, companyId);
    },
  });
}

export function useDeleteInvoice() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId }: { invoiceId: string }) =>
      requireCompany(companyId) ?? deleteInvoice(companyId as string, invoiceId),
    onSuccess: async () => {
      if (companyId) await invalidateInvoiceQueries(queryClient, companyId);
    },
  });
}
