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

export interface DashboardDailyReportAppliedFilters {
  appliedDatePreset: DashboardDatePreset | null;
  dateFrom: string | null;
  dateTo: string | null;
  type: BackendTicketType | null;
  status: BackendTicketStatus | null;
  category: string | null;
  paymentMethod: BackendPaymentMethod | null;
}

export interface DashboardDailyReportResponse {
  filters: DashboardDailyReportAppliedFilters;
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
