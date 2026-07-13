import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getDashboardKpis } from '@/services/dashboard.service';
import type { DashboardKpisResponse } from '@/types/dashboard';
import {
  endOfCivilDayIso,
  formatMxn,
  isFiniteNumber,
  isValidDateRange,
  paymentMethodKpiFromTop,
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

function parseKpis(raw: unknown): DashboardKpisResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const income = data.totalIncome as Record<string, unknown> | undefined;
  const expenses = data.totalExpenses as Record<string, unknown> | undefined;
  if (!income || typeof income !== 'object') return null;
  if (!expenses || typeof expenses !== 'object') return null;
  if (!isFiniteNumber(income.amount) || !isFiniteNumber(expenses.amount)) return null;
  if (!isFiniteNumber(data.netBalance)) return null;

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
    totalIncome: {
      amount: income.amount,
      count: isFiniteNumber(income.count) ? income.count : 0,
    },
    totalExpenses: {
      amount: expenses.amount,
      count: isFiniteNumber(expenses.count) ? expenses.count : 0,
    },
    netBalance: data.netBalance,
    topPaymentMethod:
      data.topPaymentMethod && typeof data.topPaymentMethod === 'object'
        ? (data.topPaymentMethod as DashboardKpisResponse['topPaymentMethod'])
        : null,
  };
}

function buildPeriodLabel(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Hasta ${dateTo}`;
  return 'Sin rango de fechas';
}

function ticketsLabel(count: number): string {
  return `${count} ticket${count === 1 ? '' : 's'}`;
}

/**
 * KPIs financieros desde GET /dashboard/kpis (agregado dedicado del backend:
 * ingresos, egresos, balance neto y método de pago top en una sola llamada).
 *
 * Limitaciones contractuales actuales del backend:
 * - /dashboard/kpis no acepta `category` ni `type` (400 si se mandan).
 * - no excluye `duplicate` ni `failed`.
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

  const kpisQuery = useQuery({
    queryKey: ['dashboard-kpis', companyId, queryParams.dateFrom ?? null, queryParams.dateTo ?? null],
    queryFn: () => getDashboardKpis(companyId as string, queryParams),
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

    if (kpisQuery.isPending) {
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

    const kpis = kpisQuery.isError ? null : parseKpis(kpisQuery.data);
    if (!kpis) {
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

    const paymentMethod = paymentMethodKpiFromTop(kpis.topPaymentMethod);
    const noMovements = kpis.totalIncome.count === 0 && kpis.totalExpenses.count === 0;

    return {
      availability: noMovements ? 'empty' : 'ready',
      income: {
        value: formatMxn(kpis.totalIncome.amount),
        subtitle: `${ticketsLabel(kpis.totalIncome.count)} · ${periodLabel}`,
      },
      expense: {
        value: formatMxn(kpis.totalExpenses.amount),
        subtitle: `${ticketsLabel(kpis.totalExpenses.count)} · ${periodLabel}`,
      },
      balance: {
        value: formatMxn(kpis.netBalance),
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
    kpisQuery.data,
    kpisQuery.isError,
    kpisQuery.isPending,
    rangeValid,
  ]);
}
