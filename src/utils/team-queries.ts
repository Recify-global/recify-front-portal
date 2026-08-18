import type { QueryClient } from '@tanstack/react-query';
import type { TeamMember } from '@/types/team';
import { ENTITY_QUERY_CACHE } from '@/utils/query-cache-policy';

export const TEAM_MEMBERS_QUERY_ROOT = 'team-members' as const;

export const teamKeys = {
  all: [TEAM_MEMBERS_QUERY_ROOT] as const,
  company: (companyId: string) => [TEAM_MEMBERS_QUERY_ROOT, companyId] as const,
};

export function teamMembersQueryKey(companyId: string) {
  return teamKeys.company(companyId);
}

export const teamQueryCacheOptions = {
  ...ENTITY_QUERY_CACHE,
} as const;

export async function invalidateTeamQueries(queryClient: QueryClient, companyId: string) {
  if (!companyId) return;
  await queryClient.invalidateQueries({ queryKey: teamKeys.company(companyId) });
}

/** Parchea un integrante en el listado cacheado de esa compañía. */
export function writeTeamMemberCache(
  queryClient: QueryClient,
  companyId: string,
  member: TeamMember,
) {
  if (!companyId || !member.id) return;

  const key = teamKeys.company(companyId);
  const current = queryClient.getQueryData<TeamMember[]>(key);
  if (!Array.isArray(current)) {
    return;
  }

  const index = current.findIndex((row) => row.id === member.id);
  if (index < 0) return;

  const next = current.slice();
  next[index] = { ...next[index], ...member };
  queryClient.setQueryData(key, next);
}
