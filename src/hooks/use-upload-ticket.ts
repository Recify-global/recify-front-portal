import { useMutation, useQueryClient } from '@tanstack/react-query';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import { useAuth } from './use-auth';

export function useUploadTicket() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file }: { file: File }) => {
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa para subir el ticket.'));
      }
      return uploadTicket(companyId, file);
    },
    onSuccess: (data) => {
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
  const { companyId } = useAuth();

  return useMutation({
    mutationFn: ({ file }: { file: File }) => {
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa para analizar el ticket.'));
      }
      return preprocessTicket(companyId, file);
    },
  });
}
