/**
 * Tipos de la sección de analítica del dashboard (6 endpoints nuevos).
 *
 * Todos comparten el filtro de fechas: `datePreset` (uno de la lista) o
 * `dateFrom`/`dateTo` explícitos. Las respuestas se normalizan de forma
 * defensiva en `@/utils/dashboard-analytics` porque el contrato exacto del
 * backend puede variar en nombres de campos; aquí se documenta la forma
 * canónica que consume la UI.
 */

export type AnalyticsDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_15_days'
  | 'last_30_days'
  | 'last_60_days'
  | 'last_90_days';

/** Estado del filtro compartido por toda la sección. */
export type AnalyticsFilter =
  | { mode: 'preset'; preset: AnalyticsDatePreset }
  | { mode: 'custom'; dateFrom: string; dateTo: string };

/** Query params que se envían a cualquiera de los 6 endpoints. */
export interface AnalyticsQuery {
  datePreset?: AnalyticsDatePreset;
  dateFrom?: string;
  dateTo?: string;
}

export type CashFlowGroupBy = 'week' | 'month';

/** Rango efectivo devuelto por el backend (UTC). null sin filtro. */
export interface AnalyticsPeriod {
  from: string | null;
  to: string | null;
}

/* ------------------------------------------------------------------ */
/* 1. GET /dashboard/expenses-by-vendor — gastos por proveedores       */
/* ------------------------------------------------------------------ */

export interface VendorExpenseRow {
  vendor: string;
  amount: number;
  count: number;
  /** Participación sobre el total del período (0..1). */
  percentage: number;
}

export interface ExpensesByVendorView {
  period: AnalyticsPeriod;
  rows: VendorExpenseRow[];
  total: number;
}

/* ------------------------------------------------------------------ */
/* 2. GET /dashboard/invoiced-vs-uninvoiced — facturado vs no facturado */
/* ------------------------------------------------------------------ */

export interface InvoicedBucket {
  amount: number;
  count: number;
}

export interface InvoicedVsUninvoicedView {
  period: AnalyticsPeriod;
  invoiced: InvoicedBucket;
  uninvoiced: InvoicedBucket;
  totalAmount: number;
  totalCount: number;
  /** Proporción facturada por monto (0..1). */
  invoicedRatio: number;
}

/* ------------------------------------------------------------------ */
/* 3. GET /dashboard/deductible-tax-by-category — IVA deducible x cat.  */
/* ------------------------------------------------------------------ */

export interface DeductibleTaxRow {
  category: string;
  deductibleTax: number;
  nonDeductibleTax: number;
  totalTax: number;
  count: number;
}

export interface DeductibleTaxByCategoryView {
  period: AnalyticsPeriod;
  rows: DeductibleTaxRow[];
  totalDeductible: number;
}

/* ------------------------------------------------------------------ */
/* 4. GET /dashboard/heatmap — gastos e ingresos por día               */
/* ------------------------------------------------------------------ */

export interface HeatmapDay {
  /** YYYY-MM-DD (día civil). */
  date: string;
  income: number;
  expense: number;
  count: number;
}

export interface HeatmapView {
  period: AnalyticsPeriod;
  days: HeatmapDay[];
  maxIncome: number;
  maxExpense: number;
  totalIncome: number;
  totalExpense: number;
}

/* ------------------------------------------------------------------ */
/* 5. GET /dashboard/invoiced-category-correlation                     */
/* ------------------------------------------------------------------ */

export interface CorrelationRow {
  category: string;
  invoicedAmount: number;
  deductibleTax: number;
  invoicedCount: number;
  totalCount: number;
  /** Proporción facturada de la categoría (0..1). */
  invoicedRatio: number;
}

export interface InvoicedCategoryCorrelationView {
  period: AnalyticsPeriod;
  rows: CorrelationRow[];
}

/* ------------------------------------------------------------------ */
/* 6. GET /dashboard/cash-flow — income/expenses por semana o mes      */
/* ------------------------------------------------------------------ */

export interface CashFlowBucket {
  /** Etiqueta legible del período (ej. "Sem 27", "Jul 2026"). */
  label: string;
  /** Inicio del período si el backend lo entrega (para ordenar). */
  periodStart: string | null;
  income: number;
  expense: number;
  net: number;
}

export interface CashFlowView {
  period: AnalyticsPeriod;
  groupBy: CashFlowGroupBy;
  buckets: CashFlowBucket[];
  totalIncome: number;
  totalExpense: number;
  netTotal: number;
}
