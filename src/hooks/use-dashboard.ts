import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardDailyReport,
  updateDashboardDailyReportTicket,
} from '@/services/dashboard.service';
import type {
  DashboardDailyReportFilters,
  DashboardDailyReportTicketUpdate,
} from '@/types/dashboard';
import { useAuth } from './use-auth';

export function useDailyReport(params: DashboardDailyReportFilters = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['dashboard', 'daily-report', companyId, params],
    queryFn: () => getDashboardDailyReport(companyId as string, params),
    enabled: Boolean(companyId),
    placeholderData: (previous) => previous,
  });
}

export function useUpdateDailyReportTicket() {
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
      if (!companyId) {
        return Promise.reject(new Error('No hay compañía activa.'));
      }
      return updateDashboardDailyReportTicket(companyId, ticketId, payload);
    },
    onSuccess: async (_data, { ticketId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'daily-report', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['ticket', companyId, ticketId] }),
      ]);
    },
  });
}
