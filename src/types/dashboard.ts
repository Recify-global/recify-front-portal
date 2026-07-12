import type {
  BackendPaymentMethod,
  BackendTicket,
  BackendTicketStatus,
  BackendTicketType,
  BackendTicketReviewStatus,
} from '@/types/ticket';

export type DashboardPeriod = 15 | 30 | 60 | 90 | 120;
export type DashboardGroupBy = 'day' | 'week' | 'month';
export type DashboardDatePreset =
  | 'today'
  | 'yesterday'
  | 'day_before_yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days';

export interface DashboardBaseFilters {
  period?: DashboardPeriod;
  dateFrom?: string;
  dateTo?: string;
  type?: BackendTicketType;
}

export interface DashboardByDateFilters extends DashboardBaseFilters {
  groupBy?: DashboardGroupBy;
}

export interface DashboardDailyReportFilters {
  datePreset?: DashboardDatePreset;
  dateFrom?: string;
  dateTo?: string;
  type?: BackendTicketType;
  status?: BackendTicketStatus;
  reviewStatus?: BackendTicketReviewStatus;
  category?: string;
  paymentMethod?: BackendPaymentMethod;
  page?: number;
  limit?: number;
}

export interface DashboardDailyReportResponse {
  filters: {
    appliedDatePreset: DashboardDatePreset | null;
    dateFrom: string | null;
    dateTo: string | null;
    type: BackendTicketType | null;
    status: BackendTicketStatus | null;
    reviewStatus: BackendTicketReviewStatus | null;
    category: string | null;
    paymentMethod: BackendPaymentMethod | null;
  };
  tickets: BackendTicket[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DashboardDailyReportTicketUpdate {
  type?: BackendTicketType;
  date?: string;
  amount?: number;
  category?: string;
  paymentMethod?: BackendPaymentMethod;
  status?: BackendTicketStatus;
  reviewStatus?: BackendTicketReviewStatus;
}

/** Response real de GET /dashboard/summary (verificado en backend service). */
export interface DashboardSummaryTotalsBucket {
  count: number;
  amount: number;
}

export interface DashboardSummaryResponse {
  period: {
    from: string | null;
    to: string | null;
  };
  totals: {
    ingresos: DashboardSummaryTotalsBucket;
    egresos: DashboardSummaryTotalsBucket;
    balance: number;
  };
  byStatus: Record<string, number>;
  totalTickets: number;
  avgAmount: number;
  topPaymentMethod: {
    paymentMethod: BackendPaymentMethod | string;
    count: number;
  } | null;
}

/** Response real de GET /dashboard/by-payment-method (array). */
export interface DashboardPaymentMethodRow {
  paymentMethod: BackendPaymentMethod | string | null;
  count: number;
  amount: number;
  /** Porcentaje por monto (backend). No usar para KPI de frecuencia. */
  percentage: number;
}

export type DashboardPaymentMethodResponse = DashboardPaymentMethodRow[];
