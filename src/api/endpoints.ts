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
    invoice: (companyId: string) => `/companies/${companyId}/upload/invoice`,
  },
  invoices: {
    list: (companyId: string) => `/companies/${companyId}/invoices`,
    byId: (companyId: string, id: string) => `/companies/${companyId}/invoices/${id}`,
    matchCandidates: (companyId: string, id: string) =>
      `/companies/${companyId}/invoices/${id}/match-candidates`,
    match: (companyId: string, id: string) => `/companies/${companyId}/invoices/${id}/match`,
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
    // Analítica avanzada (comparte el filtro de fechas datePreset | dateFrom/dateTo).
    expensesByVendor: (companyId: string) =>
      `/companies/${companyId}/dashboard/expenses-by-vendor`,
    invoicedVsUninvoiced: (companyId: string) =>
      `/companies/${companyId}/dashboard/invoiced-vs-uninvoiced`,
    deductibleTaxByCategory: (companyId: string) =>
      `/companies/${companyId}/dashboard/deductible-tax-by-category`,
    heatmap: (companyId: string) => `/companies/${companyId}/dashboard/heatmap`,
    invoicedCategoryCorrelation: (companyId: string) =>
      `/companies/${companyId}/dashboard/invoiced-category-correlation`,
    cashFlow: (companyId: string) => `/companies/${companyId}/dashboard/cash-flow`,
  },
} as const;
