import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type { Company } from '@/types/company';

// Listado de compañías accesibles para el usuario autenticado.
// Útil a futuro para selector de empresa; hoy el companyId se deriva del login (user.companies[0]).
export async function listMyCompanies(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.append('page', String(params.page));
  if (params.limit) qs.append('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<Paginated<Company>>(`${endpoints.companies.list()}${suffix}`);
}

export async function getCompany(id: string) {
  return apiRequest<Company>(endpoints.companies.byId(id));
}
