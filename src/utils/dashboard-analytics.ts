import {
  civilDateInTimeZone,
  endOfCivilDayIso,
  formatMxn,
  inclusiveDaysRange,
  isValidDateRange,
  startOfCivilDayIso,
} from '@/utils/financial-kpis';
import type {
  AnalyticsDatePreset,
  AnalyticsFilter,
  AnalyticsPeriod,
  AnalyticsQuery,
  CashFlowBucket,
  CashFlowGroupBy,
  CashFlowView,
  CorrelationRow,
  DeductibleTaxByCategoryView,
  DeductibleTaxRow,
  ExpensesByVendorView,
  HeatmapDay,
  HeatmapView,
  InvoicedBucket,
  InvoicedCategoryCorrelationView,
  InvoicedVsUninvoicedView,
  VendorExpenseRow,
} from '@/types/dashboard-analytics';

export { formatMxn };

/* ------------------------------------------------------------------ */
/* Presets de fecha                                                    */
/* ------------------------------------------------------------------ */

export const ANALYTICS_DATE_PRESETS: ReadonlyArray<{
  id: AnalyticsDatePreset;
  label: string;
}> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last_7_days', label: '7 días' },
  { id: 'last_15_days', label: '15 días' },
  { id: 'last_30_days', label: '30 días' },
  { id: 'last_60_days', label: '60 días' },
  { id: 'last_90_days', label: '90 días' },
];

export const DEFAULT_ANALYTICS_FILTER: AnalyticsFilter = {
  mode: 'preset',
  preset: 'last_30_days',
};

function shiftCivilDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

/** Rango civil (YYYY-MM-DD) que representa un preset, para mostrarlo en UI. */
export function resolveAnalyticsPresetRange(
  preset: AnalyticsDatePreset,
  now = new Date(),
): { dateFrom: string; dateTo: string } {
  const today = civilDateInTimeZone(now);
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'yesterday': {
      const yesterday = shiftCivilDate(today, -1);
      return { dateFrom: yesterday, dateTo: yesterday };
    }
    case 'last_7_days':
      return inclusiveDaysRange(7, now);
    case 'last_15_days':
      return inclusiveDaysRange(15, now);
    case 'last_30_days':
      return inclusiveDaysRange(30, now);
    case 'last_60_days':
      return inclusiveDaysRange(60, now);
    case 'last_90_days':
      return inclusiveDaysRange(90, now);
    default:
      return inclusiveDaysRange(30, now);
  }
}

/** Rango civil efectivo del filtro (preset resuelto o rango personalizado). */
export function resolveAnalyticsRange(
  filter: AnalyticsFilter,
  now = new Date(),
): { dateFrom: string; dateTo: string } {
  if (filter.mode === 'preset') return resolveAnalyticsPresetRange(filter.preset, now);
  return { dateFrom: filter.dateFrom, dateTo: filter.dateTo };
}

/** Etiqueta corta del período activo (para encabezados). */
export function analyticsFilterLabel(filter: AnalyticsFilter): string {
  if (filter.mode === 'preset') {
    return ANALYTICS_DATE_PRESETS.find((p) => p.id === filter.preset)?.label ?? 'Período';
  }
  const { dateFrom, dateTo } = filter;
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Hasta ${dateTo}`;
  return 'Rango personalizado';
}

export function isAnalyticsFilterValid(filter: AnalyticsFilter): boolean {
  if (filter.mode === 'preset') return true;
  const hasDates = Boolean(filter.dateFrom.trim() && filter.dateTo.trim());
  return hasDates && isValidDateRange(filter.dateFrom, filter.dateTo);
}

/** Construye los query params para el servicio a partir del filtro. */
export function buildAnalyticsQuery(filter: AnalyticsFilter): AnalyticsQuery {
  if (filter.mode === 'preset') return { datePreset: filter.preset };
  const query: AnalyticsQuery = {};
  if (filter.dateFrom.trim()) query.dateFrom = startOfCivilDayIso(filter.dateFrom.trim());
  if (filter.dateTo.trim()) query.dateTo = endOfCivilDayIso(filter.dateTo.trim());
  return query;
}

/* ------------------------------------------------------------------ */
/* Formatters y paleta                                                 */
/* ------------------------------------------------------------------ */

const compactMxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

/** Moneda compacta para ejes/etiquetas apretadas (ej. $1.2k, $3.4M). */
export function formatCompactMxn(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return compactMxnFormatter.format(value);
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return integerFormatter.format(value);
}

/** 0..1 → "42%". */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

export function ticketsLabel(count: number): string {
  return `${formatInt(count)} ticket${count === 1 ? '' : 's'}`;
}

/**
 * Colores semánticos alineados a los tokens del tema (coral corporativo).
 * Comparten un registro tonal común (saturación ~50-72%, luminosidad ~46-64%)
 * para que las gráficas se sientan parte de la misma plataforma. El "expense"
 * ancla en el mismo matiz (354) que --primary.
 */
export const ANALYTICS_COLORS = {
  income: 'hsl(152 48% 46%)',
  expense: 'hsl(354 72% 64%)',
  invoiced: 'hsl(210 64% 57%)',
  uninvoiced: 'hsl(38 80% 59%)',
  deductible: 'hsl(268 48% 65%)',
  net: 'hsl(330 10% 40%)',
  neutral: 'hsl(330 22% 85%)',
  grid: 'hsl(330 28% 91%)',
} as const;

/**
 * Paleta categórica armónica para series con muchas llaves.
 * Sesgada hacia matices cálidos/rosados de la marca y con saturación/luminosidad
 * uniformes, de modo que ninguna serie "grite" frente a las demás.
 */
export const CATEGORICAL_PALETTE = [
  'hsl(354 70% 66%)', // coral marca
  'hsl(336 54% 63%)', // rosa
  'hsl(18 70% 64%)',  // coral cálido
  'hsl(268 46% 66%)', // violeta suave
  'hsl(210 60% 60%)', // azul apagado
  'hsl(152 44% 50%)', // verde salvia
  'hsl(38 74% 61%)',  // ámbar cálido
  'hsl(310 42% 65%)', // orquídea
];

export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

/* ------------------------------------------------------------------ */
/* Helpers de normalización defensiva                                  */
/* ------------------------------------------------------------------ */

function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Devuelve el primer campo presente entre varios alias. */
function field(row: unknown, keys: string[]): unknown {
  const record = asRecord(row);
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

/** Encuentra el primer arreglo entre alias de clave (o `data`, o raíz). */
function firstArray(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (Array.isArray(record.data)) return record.data as unknown[];
  const nested = asRecord(record.data);
  for (const key of keys) {
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

function pickPeriod(raw: unknown): AnalyticsPeriod {
  const period = asRecord(asRecord(raw).period);
  return {
    from: typeof period.from === 'string' ? period.from : null,
    to: typeof period.to === 'string' ? period.to : null,
  };
}

function toBucket(value: unknown): InvoicedBucket {
  if (typeof value === 'number') return { amount: value, count: 0 };
  return {
    amount: toNum(field(value, ['amount', 'total', 'value', 'sum'])),
    count: toNum(field(value, ['count', 'tickets', 'transactions'])),
  };
}

/* ------------------------------------------------------------------ */
/* Normalizadores por endpoint                                         */
/* ------------------------------------------------------------------ */

export function normalizeExpensesByVendor(raw: unknown): ExpensesByVendorView {
  const rows: VendorExpenseRow[] = firstArray(raw, [
    'vendors',
    'expensesByVendor',
    'rows',
    'items',
  ])
    .map((row) => ({
      vendor: toStr(field(row, ['vendor', 'name', 'label', '_id'])).trim() || 'Sin proveedor',
      amount: toNum(field(row, ['amount', 'total', 'expense', 'expenses', 'value', 'sum'])),
      count: toNum(field(row, ['count', 'tickets', 'transactions'])),
      percentage: 0,
    }))
    .filter((row) => row.amount > 0 || row.count > 0);

  rows.sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  for (const row of rows) row.percentage = total > 0 ? row.amount / total : 0;

  return { period: pickPeriod(raw), rows, total };
}

export function normalizeInvoicedVsUninvoiced(raw: unknown): InvoicedVsUninvoicedView {
  const record = asRecord(raw);
  let invoiced = toBucket(
    field(record, ['invoiced', 'facturado', 'withInvoice', 'billed']),
  );
  let uninvoiced = toBucket(
    field(record, ['uninvoiced', 'notInvoiced', 'noInvoiced', 'sinFactura', 'withoutInvoice', 'unbilled']),
  );

  // Fallback: respuesta como arreglo [{ status, amount, count }, ...].
  if (invoiced.amount === 0 && uninvoiced.amount === 0) {
    const arr = firstArray(raw, ['rows', 'items', 'breakdown']);
    for (const row of arr) {
      const key = toStr(field(row, ['status', 'label', 'type', '_id'])).toLowerCase();
      const bucket = toBucket(row);
      if (key.includes('no') || key.includes('sin') || key.includes('un')) uninvoiced = bucket;
      else if (key.includes('fact') || key.includes('invoic') || key.includes('bill')) invoiced = bucket;
    }
  }

  const totalAmount = invoiced.amount + uninvoiced.amount;
  const totalCount = invoiced.count + uninvoiced.count;
  const invoicedRatio = totalAmount > 0 ? invoiced.amount / totalAmount : 0;

  return {
    period: pickPeriod(raw),
    invoiced,
    uninvoiced,
    totalAmount,
    totalCount,
    invoicedRatio,
  };
}

export function normalizeDeductibleTaxByCategory(
  raw: unknown,
): DeductibleTaxByCategoryView {
  const rows: DeductibleTaxRow[] = firstArray(raw, [
    'categories',
    'deductibleTaxByCategory',
    'rows',
    'items',
  ])
    .map((row) => ({
      category: toStr(field(row, ['category', 'name', 'label', '_id'])).trim() || 'Sin categoría',
      deductibleTax: toNum(
        field(row, ['deductibleTax', 'deductible', 'ivaDeducible', 'iva', 'tax', 'vat']),
      ),
      amount: toNum(field(row, ['amount', 'total', 'expense', 'base', 'subtotal'])),
      count: toNum(field(row, ['count', 'tickets', 'transactions'])),
    }))
    .filter((row) => row.deductibleTax > 0 || row.amount > 0 || row.count > 0);

  rows.sort((a, b) => b.deductibleTax - a.deductibleTax);
  const totalDeductible = rows.reduce((sum, row) => sum + row.deductibleTax, 0);

  return { period: pickPeriod(raw), rows, totalDeductible };
}

export function normalizeHeatmap(raw: unknown): HeatmapView {
  const days: HeatmapDay[] = firstArray(raw, ['days', 'heatmap', 'cells', 'rows'])
    .map((row) => ({
      date: toStr(field(row, ['date', 'day', '_id'])).slice(0, 10),
      income: toNum(field(row, ['income', 'ingreso', 'ingresos', 'incomes'])),
      expense: toNum(field(row, ['expense', 'egreso', 'egresos', 'expenses'])),
      count: toNum(field(row, ['count', 'tickets', 'transactions'])),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));

  days.sort((a, b) => a.date.localeCompare(b.date));

  let maxIncome = 0;
  let maxExpense = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  for (const day of days) {
    if (day.income > maxIncome) maxIncome = day.income;
    if (day.expense > maxExpense) maxExpense = day.expense;
    totalIncome += day.income;
    totalExpense += day.expense;
  }

  return { period: pickPeriod(raw), days, maxIncome, maxExpense, totalIncome, totalExpense };
}

export function normalizeInvoicedCategoryCorrelation(
  raw: unknown,
): InvoicedCategoryCorrelationView {
  const rows: CorrelationRow[] = firstArray(raw, [
    'categories',
    'correlation',
    'correlations',
    'rows',
    'items',
  ])
    .map((row) => {
      const invoicedAmount = toNum(
        field(row, ['invoicedAmount', 'invoicedTotal', 'facturado', 'amount', 'invoiced']),
      );
      const deductibleTax = toNum(
        field(row, ['deductibleTax', 'deductible', 'ivaDeducible', 'iva', 'tax', 'vat']),
      );
      const invoicedCount = toNum(
        field(row, ['invoicedCount', 'invoicedTickets', 'invoiced']),
      );
      const totalCount = toNum(field(row, ['totalCount', 'count', 'tickets', 'total']));
      const explicitRatio = field(row, ['invoicedRatio', 'ratio', 'correlation']);
      const invoicedRatio =
        explicitRatio !== undefined
          ? toNum(explicitRatio)
          : totalCount > 0
            ? invoicedCount / totalCount
            : 0;
      return {
        category: toStr(field(row, ['category', 'name', 'label', '_id'])).trim() || 'Sin categoría',
        invoicedAmount,
        deductibleTax,
        invoicedCount,
        totalCount,
        invoicedRatio: Math.max(0, Math.min(1, invoicedRatio)),
      };
    })
    .filter((row) => row.invoicedAmount > 0 || row.deductibleTax > 0 || row.totalCount > 0);

  rows.sort((a, b) => b.deductibleTax - a.deductibleTax);

  return { period: pickPeriod(raw), rows };
}

export function normalizeCashFlow(raw: unknown, requestedGroupBy: CashFlowGroupBy): CashFlowView {
  const buckets: CashFlowBucket[] = firstArray(raw, [
    'buckets',
    'cashFlow',
    'periods',
    'series',
    'rows',
  ]).map((row) => {
    const income = toNum(field(row, ['income', 'ingreso', 'ingresos', 'incomes']));
    const expense = toNum(field(row, ['expense', 'egreso', 'egresos', 'expenses']));
    const netRaw = field(row, ['net', 'balance', 'neto', 'netBalance']);
    const periodStartRaw = field(row, ['periodStart', 'start', 'from', 'date']);
    return {
      label: toStr(field(row, ['label', 'period', 'bucket', 'week', 'month', 'date', '_id'])),
      periodStart: typeof periodStartRaw === 'string' ? periodStartRaw : null,
      income,
      expense,
      net: netRaw !== undefined ? toNum(netRaw) : income - expense,
    };
  });

  const rawGroupBy = toStr(field(raw, ['groupBy', 'group', 'interval', 'granularity'])).toLowerCase();
  const groupBy: CashFlowGroupBy = rawGroupBy.includes('week')
    ? 'week'
    : rawGroupBy.includes('month')
      ? 'month'
      : requestedGroupBy;

  let totalIncome = 0;
  let totalExpense = 0;
  for (const bucket of buckets) {
    totalIncome += bucket.income;
    totalExpense += bucket.expense;
  }

  return {
    period: pickPeriod(raw),
    groupBy,
    buckets,
    totalIncome,
    totalExpense,
    netTotal: totalIncome - totalExpense,
  };
}
