import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type {
  DashboardBaseFilters,
  DashboardByDateFilters,
  DashboardDailyReportFilters,
  DashboardDailyReportResponse,
  DashboardDailyReportTicketUpdate,
} from '@/types/dashboard';
import type { BackendTicket } from '@/types/ticket';

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function getDashboardSummary(companyId: string, params: DashboardBaseFilters = {}) {
  const url = `${endpoints.dashboard.summary(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Record<string, unknown>>(url);
}

export async function getDashboardByDate(companyId: string, params: DashboardByDateFilters = {}) {
  const url = `${endpoints.dashboard.byDate(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Record<string, unknown>>(url);
}

export async function getDashboardByCategory(companyId: string, params: DashboardBaseFilters = {}) {
  const url = `${endpoints.dashboard.byCategory(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Record<string, unknown>>(url);
}

export async function getDashboardByPaymentMethod(companyId: string, params: DashboardBaseFilters = {}) {
  const url = `${endpoints.dashboard.byPaymentMethod(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<Record<string, unknown>>(url);
}

export async function getDashboardDailyReport(
  companyId: string,
  params: DashboardDailyReportFilters = {},
): Promise<DashboardDailyReportResponse> {
  const url = `${endpoints.dashboard.dailyReport(companyId)}${toQueryString(params as Record<string, unknown>)}`;
  return apiRequest<DashboardDailyReportResponse>(url);
}

export async function updateDashboardDailyReportTicket(
  companyId: string,
  ticketId: string,
  payload: DashboardDailyReportTicketUpdate,
): Promise<BackendTicket> {
  return apiRequest<BackendTicket>(endpoints.dashboard.dailyReportTicket(companyId, ticketId), {
    method: 'PATCH',
    body: payload,
  });
}
