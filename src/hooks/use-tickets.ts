import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateDashboardDailyReportTicket } from '@/services/dashboard.service';
import {
  getTicket,
  listTickets,
} from '@/services/tickets.service';
import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';
import type { TicketsListParams } from '@/types/ticket';
import { useAuth } from './use-auth';

export function useTickets(params: TicketsListParams = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['tickets', companyId, params],
    queryFn: () => listTickets(companyId as string, params),
    enabled: Boolean(companyId),
  });
}

export function useTicket(id: string | null | undefined) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['ticket', companyId, id],
    queryFn: () => getTicket(companyId as string, id as string),
    enabled: Boolean(companyId) && Boolean(id),
  });
}

/** Edición manual vía PATCH /dashboard/daily-report/:ticketId (contrato más completo). */
export function useUpdateDashboardTicket() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      payload,
    }: {
      ticketId: string;
      payload: DashboardDailyReportTicketUpdate;
    }) => {
      if (!companyId) return Promise.reject(new Error('No hay compañía activa.'));
      return updateDashboardDailyReportTicket(companyId, ticketId, payload);
    },
    onSuccess: async (_data, { ticketId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['ticket', companyId, ticketId] }),
      ]);
    },
  });
}
