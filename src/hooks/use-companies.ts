import { useMemo } from 'react';
import type { Company } from '@/types/company';
import { useAuth } from './use-auth';

/**
 * Proyecta las compañías desde memberships verificadas por el backend.
 * La selección sigue siendo contexto UX; cada request vuelve a autorizarse.
 */
export function useCompanies() {
  const { user, companyId } = useAuth();

  const companies = useMemo(() => {
    return (user?.memberships ?? []).map<Company>((membership) => ({
      _id: membership.companyId,
      name: membership.companyName,
      timezone: membership.companyTimezone,
      status: membership.companyStatus,
    }));
  }, [user]);
  const allowedIds = useMemo(() => companies.map((company) => company._id), [companies]);

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
    isLoading: false,
    isError: false,
    refetch: async () => undefined,
  };
}
