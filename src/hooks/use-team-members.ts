import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  updateTeamMemberRole,
} from '@/services/team.service';
import type { MembershipRole } from '@/types/auth';
import type { AddTeamMemberInput, TeamMembersParams } from '@/types/team';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { teamMembersQueryKey } from '@/utils/team-queries';
import { useAuth } from './use-auth';

async function refreshTeamAndSession(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(companyId) }),
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  ]);
}

export function useTeamMembers(params: TeamMembersParams = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: [...teamMembersQueryKey(companyId ?? ''), params],
    queryFn: ({ signal }) =>
      listTeamMembers(companyId as string, params, { signal }),
    enabled: Boolean(companyId),
    retry: false,
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: AddTeamMemberInput;
    }) => addTeamMember(companyId, input),
    onSuccess: async (_data, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      await refreshTeamAndSession(queryClient, companyId);
    },
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
    }: {
      companyId: string;
      memberId: string;
      role: MembershipRole;
    }) => updateTeamMemberRole(companyId, memberId, role),
    onSuccess: async (_data, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      await refreshTeamAndSession(queryClient, companyId);
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    onMutate: captureAuthMutationContext,
    mutationFn: ({
      companyId,
      memberId,
    }: {
      companyId: string;
      memberId: string;
    }) => removeTeamMember(companyId, memberId),
    onSuccess: async (_data, { companyId }, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      await refreshTeamAndSession(queryClient, companyId);
    },
  });
}
