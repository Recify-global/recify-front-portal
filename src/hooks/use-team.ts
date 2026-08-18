import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listTeamMembers, updateTeamMemberRole } from '@/services/team.service';
import type { TeamRole } from '@/types/team';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { shouldRetryTeamQuery } from '@/utils/team-errors';
import {
  invalidateTeamQueries,
  teamMembersQueryKey,
  teamQueryCacheOptions,
  writeTeamMemberCache,
} from '@/utils/team-queries';
import { useAuth } from './use-auth';

function requireCompanyId(companyId: string): void {
  if (!companyId) {
    throw new Error('No hay compañía activa.');
  }
}

export function useTeamMembers() {
  const { companyId } = useAuth();

  return useQuery({
    queryKey: teamMembersQueryKey(companyId ?? ''),
    queryFn: ({ signal }) => listTeamMembers(companyId as string, { signal }),
    enabled: Boolean(companyId),
    ...teamQueryCacheOptions,
    retry: shouldRetryTeamQuery,
  });
}

export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      memberId,
      role,
      signal,
    }: {
      companyId: string;
      memberId: string;
      role: TeamRole;
      signal?: AbortSignal;
    }) => {
      requireCompanyId(companyId);
      return updateTeamMemberRole(companyId, memberId, role, { signal });
    },
    onSuccess: async (member, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      writeTeamMemberCache(queryClient, companyId, member);
      if (!isAuthMutationContextCurrent(context)) return;
      await invalidateTeamQueries(queryClient, companyId);
    },
  });
}
