import { useQuery } from '@tanstack/react-query';
import {
  getCashFlow,
  getDeductibleTaxByCategory,
  getExpensesByVendor,
  getExpensesIncomeHeatmap,
  getInvoicedCategoryCorrelation,
  getInvoicedVsUninvoiced,
} from '@/services/dashboard-analytics.service';
import type {
  AnalyticsQuery,
  CashFlowGroupBy,
  CashFlowView,
  DeductibleTaxByCategoryView,
  ExpensesByVendorView,
  HeatmapView,
  InvoicedCategoryCorrelationView,
  InvoicedVsUninvoicedView,
} from '@/types/dashboard-analytics';
import {
  normalizeCashFlow,
  normalizeDeductibleTaxByCategory,
  normalizeExpensesByVendor,
  normalizeHeatmap,
  normalizeInvoicedCategoryCorrelation,
  normalizeInvoicedVsUninvoiced,
} from '@/utils/dashboard-analytics';
import { useAuth } from './use-auth';

/** Clave estable del query params para el cache de react-query. */
function queryKeyPart(query: AnalyticsQuery): AnalyticsQuery {
  return {
    datePreset: query.datePreset,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

interface AnalyticsHookOptions {
  enabled?: boolean;
}

export function useExpensesByVendor(query: AnalyticsQuery, options: AnalyticsHookOptions = {}) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, ExpensesByVendorView>({
    queryKey: ['dashboard-expenses-by-vendor', companyId, queryKeyPart(query)],
    queryFn: () => getExpensesByVendor(companyId as string, query),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: normalizeExpensesByVendor,
  });
}

export function useInvoicedVsUninvoiced(
  query: AnalyticsQuery,
  options: AnalyticsHookOptions = {},
) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, InvoicedVsUninvoicedView>({
    queryKey: ['dashboard-invoiced-vs-uninvoiced', companyId, queryKeyPart(query)],
    queryFn: () => getInvoicedVsUninvoiced(companyId as string, query),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: normalizeInvoicedVsUninvoiced,
  });
}

export function useDeductibleTaxByCategory(
  query: AnalyticsQuery,
  options: AnalyticsHookOptions = {},
) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, DeductibleTaxByCategoryView>({
    queryKey: ['dashboard-deductible-tax-by-category', companyId, queryKeyPart(query)],
    queryFn: () => getDeductibleTaxByCategory(companyId as string, query),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: normalizeDeductibleTaxByCategory,
  });
}

export function useExpensesIncomeHeatmap(
  query: AnalyticsQuery,
  options: AnalyticsHookOptions = {},
) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, HeatmapView>({
    queryKey: ['dashboard-heatmap', companyId, queryKeyPart(query)],
    queryFn: () => getExpensesIncomeHeatmap(companyId as string, query),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: normalizeHeatmap,
  });
}

export function useInvoicedCategoryCorrelation(
  query: AnalyticsQuery,
  options: AnalyticsHookOptions = {},
) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, InvoicedCategoryCorrelationView>({
    queryKey: ['dashboard-invoiced-category-correlation', companyId, queryKeyPart(query)],
    queryFn: () => getInvoicedCategoryCorrelation(companyId as string, query),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: normalizeInvoicedCategoryCorrelation,
  });
}

export function useCashFlow(
  query: AnalyticsQuery,
  groupBy: CashFlowGroupBy,
  options: AnalyticsHookOptions = {},
) {
  const { companyId } = useAuth();
  return useQuery<unknown, Error, CashFlowView>({
    queryKey: ['dashboard-cash-flow', companyId, groupBy, queryKeyPart(query)],
    queryFn: () => getCashFlow(companyId as string, query, groupBy),
    enabled: Boolean(companyId) && options.enabled !== false,
    select: (raw) => normalizeCashFlow(raw, groupBy),
  });
}
