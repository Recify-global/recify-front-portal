export const endpoints = {
  auth: {
    login: () => '/auth/login',
    register: () => '/auth/register',
  },
  companies: {
    list: () => '/companies',
    byId: (id: string) => `/companies/${id}`,
  },
  tickets: {
    list: (companyId: string) => `/companies/${companyId}/tickets`,
    byId: (companyId: string, id: string) => `/companies/${companyId}/tickets/${id}`,
  },
  upload: {
    preprocess: (companyId: string) => `/companies/${companyId}/upload/preprocess`,
    ticket: (companyId: string) => `/companies/${companyId}/upload/ticket`,
  },
  dashboard: {
    kpis: (companyId: string) => `/companies/${companyId}/dashboard/kpis`,
    summary: (companyId: string) => `/companies/${companyId}/dashboard/summary`,
    byDate: (companyId: string) => `/companies/${companyId}/dashboard/by-date`,
    byCategory: (companyId: string) => `/companies/${companyId}/dashboard/by-category`,
    byPaymentMethod: (companyId: string) => `/companies/${companyId}/dashboard/by-payment-method`,
    dailyReport: (companyId: string) => `/companies/${companyId}/dashboard/daily-report`,
    dailyReportTicket: (companyId: string, ticketId: string) =>
      `/companies/${companyId}/dashboard/daily-report/${ticketId}`,
  },
} as const;
