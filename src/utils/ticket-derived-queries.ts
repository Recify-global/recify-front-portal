import type { QueryClient } from '@tanstack/react-query';
import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';

/**
 * Fields that change GET /dashboard/kpis aggregates (income/expense/balance/top payment).
 *
 * Contract evidence (recify-back-api, verified 2026-07-16):
 * - `kpis.service.js` + `helpers.buildMatch`: match = companyId + optional date/type only.
 *   No `$match` on `status` → pending/processed/failed/duplicate all count.
 * - `dashboard.validator` `kpisSchema`: only `period` | `dateFrom` | `dateTo`.
 *   No `category` (and no `status`); FE disables KPIs when category !== 'all'.
 * - FE helper `isKpiExcludedStatus` is unused by `useFinancialKpis` (includesAllStatuses: true).
 *
 * Therefore NOT relevant for invalidation today: status, category, vendor, isAccreditable.
 */
export const KPI_RELEVANT_TICKET_FIELDS = [
  'type',
  'amount',
  'date',
  'paymentMethod',
] as const;

export type KpiRelevantTicketField = (typeof KPI_RELEVANT_TICKET_FIELDS)[number];

export type TicketDerivedQueryInvalidation = {
  tickets?: boolean;
  ticketDetail?: boolean;
  dailyReport?: boolean;
  financialKpis?: boolean;
};

/** Prefix shared by all History KPI queries for a company (dates are extra key parts). */
export function financialKpiQueryKeyPrefix(companyId: string) {
  return ['dashboard-kpis', companyId] as const;
}

export function ticketUpdateAffectsFinancialKpis(
  payload: DashboardDailyReportTicketUpdate,
): boolean {
  return KPI_RELEVANT_TICKET_FIELDS.some((field) => payload[field] !== undefined);
}

/**
 * Invalidate ticket-derived caches for a captured origin company.
 * Never reads the active company from auth/storage — callers pass originCompanyId.
 */
export async function invalidateTicketDerivedQueries(
  queryClient: QueryClient,
  originCompanyId: string,
  options: TicketDerivedQueryInvalidation,
  ticketId?: string,
): Promise<void> {
  if (!originCompanyId) return;

  const tasks: Array<Promise<unknown>> = [];

  if (options.tickets) {
    tasks.push(queryClient.invalidateQueries({ queryKey: ['tickets', originCompanyId] }));
  }
  if (options.ticketDetail && ticketId) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: ['ticket', originCompanyId, ticketId] }),
    );
  }
  if (options.dailyReport) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: ['dashboard-daily-report', originCompanyId],
      }),
    );
  }
  if (options.financialKpis) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: financialKpiQueryKeyPrefix(originCompanyId),
      }),
    );
  }

  if (tasks.length > 0) await Promise.all(tasks);
}
