import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listMyCompanies } from '@/services/company.service';
import type { Company } from '@/types/company';
import { useAuth } from './use-auth';

/**
 * Lista compañías del usuario autenticado.
 * Cruza `listMyCompanies()` con `user.companies` para no mostrar IDs ajenos.
 * Si el endpoint falla, no inventa datos: el caller debe degradar la UI.
 */
export function useCompanies() {
  const { user, companyId } = useAuth();

  const allowedIds = useMemo(() => {
    if (!user || !Array.isArray(user.companies)) return [] as string[];
    return user.companies.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }, [user]);

  const query = useQuery({
    queryKey: ['companies', 'mine', allowedIds.join(',')],
    queryFn: () => listMyCompanies({ page: 1, limit: 100 }),
    enabled: allowedIds.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const companies = useMemo(() => {
    const rows = query.data?.data;
    if (!Array.isArray(rows) || allowedIds.length === 0) return [] as Company[];
    const allowed = new Set(allowedIds);
    return rows.filter((c): c is Company => {
      if (!c || typeof c !== 'object') return false;
      const id = typeof c._id === 'string' ? c._id : '';
      return id.length > 0 && allowed.has(id);
    });
  }, [allowedIds, query.data?.data]);

  const activeCompany = useMemo(() => {
    if (!companyId) return null;
    return companies.find((c) => c._id === companyId) ?? null;
  }, [companies, companyId]);

  const hasNames = useMemo(
    () => companies.some((c) => typeof c.name === 'string' && c.name.trim().length > 0),
    [companies],
  );

  return {
    companies,
    activeCompany,
    allowedIds,
    hasNames,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
