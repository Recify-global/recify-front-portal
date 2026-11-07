import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type { Company } from '@/types/company';

export interface CompanyProfile extends Company {
  rfcMasked: string | null;
}

export async function listMyCompanies(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.append('page', String(params.page));
  if (params.limit) qs.append('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<Paginated<Company>>(`${endpoints.companies.list()}${suffix}`);
}

export function getCompany(
  companyId: string,
  signal?: AbortSignal,
): Promise<CompanyProfile> {
  return apiRequest<CompanyProfile>(endpoints.companies.byId(companyId), { signal });
}

export function updateCompanyName(
  companyId: string,
  name: string,
): Promise<CompanyProfile> {
  return apiRequest<CompanyProfile>(endpoints.companies.byId(companyId), {
    method: 'PATCH',
    body: { name },
  });
}
