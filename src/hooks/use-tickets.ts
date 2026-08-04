import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardDailyReport,
  updateDashboardDailyReportTicket,
} from '@/services/dashboard.service';
import { listTickets } from '@/services/tickets.service';
import type {
  DashboardDailyReportFilters,
  DashboardDailyReportTicketUpdate,
} from '@/types/dashboard';
import type { TicketsListParams } from '@/types/ticket';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { invalidateTicketDerivedQueries } from '@/utils/ticket-derived-queries';
import {
  normalizeTicketListParams,
  ticketListQueryKey,
  ticketQueryCacheOptions,
} from '@/utils/ticket-queries';
import { useAuth } from './use-auth';

export function useTickets(params: TicketsListParams = {}) {
  const { companyId } = useAuth();
  const normalized = normalizeTicketListParams(params);

  return useQuery({
    queryKey: ticketListQueryKey(companyId ?? '', params),
    queryFn: ({ signal }) =>
      listTickets(companyId as string, normalized, { signal }),
    enabled: Boolean(companyId),
    ...ticketQueryCacheOptions,
  });
}

/** Misma página del Histórico, enriquecida por backend con `imageUrl`. */
export function useDashboardDailyReport(
  params: DashboardDailyReportFilters = {},
) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['dashboard-daily-report', companyId, params],
    queryFn: ({ signal }) =>
      getDashboardDailyReport(companyId as string, params, { signal }),
    enabled: Boolean(companyId),
    ...ticketQueryCacheOptions,
  });
}

/** Edición manual vía PATCH /dashboard/daily-report/:ticketId (contrato más completo). */
export function useUpdateDashboardTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      ticketId,
      payload,
      signal,
    }: {
      companyId: string;
      ticketId: string;
      payload: DashboardDailyReportTicketUpdate;
      signal?: AbortSignal;
    }) => {
      if (!companyId) return Promise.reject(new Error('No hay compañía activa.'));
      return updateDashboardDailyReportTicket(companyId, ticketId, payload, { signal });
    },
    onSuccess: async (_data, { companyId, ticketId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      // KPIs are owned by the caller (only when the payload is aggregation-relevant).
      await invalidateTicketDerivedQueries(queryClient, companyId, {
        tickets: true,
        ticketDetail: true,
        dailyReport: true,
      }, ticketId);
    },
  });
}
