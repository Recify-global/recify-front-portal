import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredCompanyId, updateStoredUser } from '@/auth/storage';
import { getMeRequest } from '@/services/auth.service';
import { getCompany, updateCompanyName } from '@/services/company.service';
import { useAuth } from './use-auth';

export const companyProfileQueryKey = (companyId: string) =>
  ['company', companyId] as const;

export function useCompanyProfile() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: companyProfileQueryKey(companyId ?? ''),
    enabled: Boolean(companyId),
    retry: false,
    queryFn: ({ signal }) => getCompany(companyId as string, signal),
  });
}

export function useUpdateCompanyName() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: ({ companyId, name }: { companyId: string; name: string }) =>
      updateCompanyName(companyId, name),
    onSuccess: async (_data, { companyId }) => {
      const profile = await getMeRequest();
      updateStoredUser(profile.user);
      if (getStoredCompanyId() === companyId) {
        await queryClient.invalidateQueries({ queryKey: companyProfileQueryKey(companyId) });
      }
    },
  });
}
