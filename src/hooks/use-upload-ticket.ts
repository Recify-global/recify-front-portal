import { useMutation, useQueryClient } from '@tanstack/react-query';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { invalidateInvoiceQueries } from '@/utils/invoice-queries';
import { invalidateTicketDerivedQueries } from '@/utils/ticket-derived-queries';
import { invalidateBalanceQueries } from '@/hooks/use-balances';

interface UploadMutationInput {
  companyId: string;
  file: File;
  signal?: AbortSignal;
}

export function useUploadTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: captureAuthMutationContext,
    mutationFn: ({ companyId, file, signal }: UploadMutationInput) => {
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa para subir el ticket.'));
      }
      return uploadTicket(companyId, file, { signal });
    },
    onSuccess: async (data, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;

      // Una captura de saldo no crea ticket: solo refresca los listados de saldos.
      if (data.kind === 'balance') {
        await invalidateBalanceQueries(queryClient, companyId);
        return;
      }

      await invalidateTicketDerivedQueries(queryClient, companyId, {
        tickets: true,
        dailyReport: true,
        financialKpis: true,
        dashboardAnalytics: true,
      });

      // El ticket subido aparece como candidato en facturas pendientes que empate.
      await invalidateInvoiceQueries(queryClient, companyId);
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
