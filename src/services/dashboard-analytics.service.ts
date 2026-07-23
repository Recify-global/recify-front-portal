import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { AnalyticsQuery, CashFlowGroupBy } from '@/types/dashboard-analytics';

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function getExpensesByVendor(
  companyId: string,
  query: AnalyticsQuery = {},
): Promise<unknown> {
  const url = `${endpoints.dashboard.expensesByVendor(companyId)}${toQueryString(query as Record<string, unknown>)}`;
  return apiRequest<unknown>(url);
}

export async function getInvoicedVsUninvoiced(
  companyId: string,
  query: AnalyticsQuery = {},
): Promise<unknown> {
  const url = `${endpoints.dashboard.invoicedVsUninvoiced(companyId)}${toQueryString(query as Record<string, unknown>)}`;
  return apiRequest<unknown>(url);
}

export async function getDeductibleTaxByCategory(
  companyId: string,
  query: AnalyticsQuery = {},
): Promise<unknown> {
  const url = `${endpoints.dashboard.deductibleTaxByCategory(companyId)}${toQueryString(query as Record<string, unknown>)}`;
  return apiRequest<unknown>(url);
}

export async function getExpensesIncomeHeatmap(
  companyId: string,
  query: AnalyticsQuery = {},
): Promise<unknown> {
  const url = `${endpoints.dashboard.heatmap(companyId)}${toQueryString(query as Record<string, unknown>)}`;
  return apiRequest<unknown>(url);
}

export async function getInvoicedCategoryCorrelation(
  companyId: string,
  query: AnalyticsQuery = {},
): Promise<unknown> {
  const url = `${endpoints.dashboard.invoicedCategoryCorrelation(companyId)}${toQueryString(query as Record<string, unknown>)}`;
  return apiRequest<unknown>(url);
}

export async function getCashFlow(
  companyId: string,
  query: AnalyticsQuery = {},
  groupBy?: CashFlowGroupBy,
): Promise<unknown> {
  const params: Record<string, unknown> = { ...query };
  if (groupBy) params.groupBy = groupBy;
  const url = `${endpoints.dashboard.cashFlow(companyId)}${toQueryString(params)}`;
  return apiRequest<unknown>(url);
}
