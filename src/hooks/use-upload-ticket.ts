import { useMutation, useQueryClient } from '@tanstack/react-query';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import { isAuthSessionClosing } from '@/auth/session-cleanup';

interface UploadMutationInput {
  companyId: string;
  file: File;
  signal?: AbortSignal;
}

export function useUploadTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, file, signal }: UploadMutationInput) => {
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa para subir el ticket.'));
      }
      return uploadTicket(companyId, file, { signal });
    },
    onSuccess: (data, { companyId }) => {
      if (isAuthSessionClosing()) return;
      queryClient.invalidateQueries({ queryKey: ['tickets', companyId] });
      // El upload de ticket puede auto-vincular una factura existente.
      if (data.matchedInvoice) {
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId] });
      }
    },
  });
}

export function usePreprocessTicket() {
  return useMutation({
    mutationFn: ({ companyId, file, signal }: UploadMutationInput) => {
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa para analizar el ticket.'));
      }
      return preprocessTicket(companyId, file, { signal });
    },
  });
}
