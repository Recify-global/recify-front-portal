import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getDashboardByPaymentMethod,
  getDashboardSummary,
} from '@/services/dashboard.service';
import type {
  DashboardPaymentMethodResponse,
  DashboardSummaryResponse,
} from '@/types/dashboard';
import {
  endOfCivilDayIso,
  formatMxn,
  isFiniteNumber,
  isValidDateRange,
  resolveMostUsedPaymentMethod,
  startOfCivilDayIso,
  type PaymentMethodKpiResult,
} from '@/utils/financial-kpis';
import { useAuth } from './use-auth';

export interface FinancialKpiFilters {
  dateFrom: string;
  dateTo: string;
  category: string;
}

export type FinancialKpiAvailability =
  | 'ready'
  | 'loading'
  | 'error'
  | 'invalid-range'
  | 'category-unsupported'
  | 'empty';

export interface FinancialKpisView {
  availability: FinancialKpiAvailability;
  income: { value: string; subtitle: string } | null;
  expense: { value: string; subtitle: string } | null;
  balance: { value: string; subtitle: string } | null;
  paymentMethod: PaymentMethodKpiResult | null;
  periodLabel: string;
  /** Backend incluye duplicate/failed; documentado como brecha. */
  includesAllStatuses: boolean;
  categorySupported: boolean;
}

function parseSummary(raw: unknown): DashboardSummaryResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const totals = data.totals;
  if (!totals || typeof totals !== 'object') return null;
  const t = totals as Record<string, unknown>;
  const ingresos = t.ingresos as Record<string, unknown> | undefined;
  const egresos = t.egresos as Record<string, unknown> | undefined;
  if (!ingresos || !egresos) return null;
  if (!isFiniteNumber(ingresos.amount) || !isFiniteNumber(egresos.amount)) return null;
  if (!isFiniteNumber(t.balance)) return null;

  return {
    period: {
      from:
        data.period && typeof data.period === 'object'
          ? ((data.period as { from?: string | null }).from ?? null)
          : null,
      to:
        data.period && typeof data.period === 'object'
          ? ((data.period as { to?: string | null }).to ?? null)
          : null,
    },
    totals: {
      ingresos: {
        count: isFiniteNumber(ingresos.count) ? ingresos.count : 0,
        amount: ingresos.amount,
      },
      egresos: {
        count: isFiniteNumber(egresos.count) ? egresos.count : 0,
        amount: egresos.amount,
      },
      balance: t.balance,
    },
    byStatus:
      data.byStatus && typeof data.byStatus === 'object'
        ? (data.byStatus as Record<string, number>)
        : {},
    totalTickets: isFiniteNumber(data.totalTickets) ? data.totalTickets : 0,
    avgAmount: isFiniteNumber(data.avgAmount) ? data.avgAmount : 0,
    topPaymentMethod:
      data.topPaymentMethod && typeof data.topPaymentMethod === 'object'
        ? (data.topPaymentMethod as DashboardSummaryResponse['topPaymentMethod'])
        : null,
  };
}

function parsePaymentMethods(raw: unknown): DashboardPaymentMethodResponse | null {
  if (!Array.isArray(raw)) return null;
  const rows: DashboardPaymentMethodResponse = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (!isFiniteNumber(row.count) || row.count < 0) return null;
    if (!isFiniteNumber(row.amount)) return null;
    rows.push({
      paymentMethod:
        typeof row.paymentMethod === 'string' || row.paymentMethod === null
          ? (row.paymentMethod as string | null)
          : String(row.paymentMethod ?? ''),
      count: Math.trunc(row.count),
      amount: row.amount,
      percentage: isFiniteNumber(row.percentage) ? row.percentage : 0,
    });
  }
  return rows;
}

function buildPeriodLabel(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Hasta ${dateTo}`;
  return 'Sin rango de fechas';
}

/**
 * KPIs financieros desde agregados de dashboard (no desde la página de tickets).
 *
 * Limitaciones contractuales actuales del backend:
 * - summary / by-payment-method no aceptan `category`.
 * - no excluyen `duplicate` ni `failed`.
 */
export function useFinancialKpis(filters: FinancialKpiFilters): FinancialKpisView {
  const { companyId } = useAuth();
  const { dateFrom, dateTo, category } = filters;

  const rangeValid = isValidDateRange(dateFrom, dateTo);
  const categoryActive = category !== 'all' && category.trim() !== '';
  const hasDateFilter = Boolean(dateFrom.trim() || dateTo.trim());

  const queryParams = useMemo(() => {
    const params: { dateFrom?: string; dateTo?: string } = {};
    if (dateFrom.trim()) params.dateFrom = startOfCivilDayIso(dateFrom.trim());
    if (dateTo.trim()) params.dateTo = endOfCivilDayIso(dateTo.trim());
    return params;
  }, [dateFrom, dateTo]);

  const enabled =
    Boolean(companyId) && rangeValid && !categoryActive && hasDateFilter;

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', companyId, queryParams.dateFrom ?? null, queryParams.dateTo ?? null],
    queryFn: () => getDashboardSummary(companyId as string, queryParams),
    enabled,
  });

  const paymentQuery = useQuery({
    queryKey: [
      'dashboard-by-payment-method',
      companyId,
      queryParams.dateFrom ?? null,
      queryParams.dateTo ?? null,
    ],
    queryFn: () => getDashboardByPaymentMethod(companyId as string, queryParams),
    enabled,
  });

  return useMemo((): FinancialKpisView => {
    const periodLabel = buildPeriodLabel(dateFrom.trim(), dateTo.trim());

    if (!rangeValid) {
      return {
        availability: 'invalid-range',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel,
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    if (categoryActive) {
      return {
        availability: 'category-unsupported',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel,
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    if (!hasDateFilter) {
      return {
        availability: 'empty',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel: 'Selecciona un período',
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    if (summaryQuery.isPending || paymentQuery.isPending) {
      return {
        availability: 'loading',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel,
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    if (summaryQuery.isError || paymentQuery.isError) {
      return {
        availability: 'error',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel,
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    const summary = parseSummary(summaryQuery.data);
    const methods = parsePaymentMethods(paymentQuery.data);
    if (!summary || !methods) {
      return {
        availability: 'error',
        income: null,
        expense: null,
        balance: null,
        paymentMethod: null,
        periodLabel,
        includesAllStatuses: true,
        categorySupported: false,
      };
    }

    const paymentMethod = resolveMostUsedPaymentMethod(methods);
    const noMovements = summary.totalTickets === 0;

    return {
      availability: noMovements ? 'empty' : 'ready',
      income: {
        value: formatMxn(summary.totals.ingresos.amount),
        subtitle: periodLabel,
      },
      expense: {
        value: formatMxn(summary.totals.egresos.amount),
        subtitle: periodLabel,
      },
      balance: {
        value: formatMxn(summary.totals.balance),
        subtitle: 'Ingresos menos egresos',
      },
      paymentMethod,
      periodLabel,
      includesAllStatuses: true,
      categorySupported: false,
    };
  }, [
    categoryActive,
    dateFrom,
    dateTo,
    hasDateFilter,
    paymentQuery.data,
    paymentQuery.isError,
    paymentQuery.isPending,
    rangeValid,
    summaryQuery.data,
    summaryQuery.isError,
    summaryQuery.isPending,
  ]);
}
