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
} as const;
