import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type { MembershipRole } from '@/types/auth';
import type {
  AddTeamMemberInput,
  AddTeamMemberResponse,
  RemoveTeamMemberResponse,
  TeamMember,
  TeamMembersParams,
} from '@/types/team';

function toQueryString(params: TeamMembersParams): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function listTeamMembers(
  companyId: string,
  params: TeamMembersParams = {},
  options: { signal?: AbortSignal } = {},
): Promise<Paginated<TeamMember>> {
  return apiRequest<Paginated<TeamMember>>(
    `${endpoints.team.members(companyId)}${toQueryString(params)}`,
    { signal: options.signal },
  );
}

export function addTeamMember(
  companyId: string,
  input: AddTeamMemberInput,
): Promise<AddTeamMemberResponse> {
  return apiRequest<AddTeamMemberResponse>(endpoints.team.members(companyId), {
    method: 'POST',
    body: input,
  });
}

export function updateTeamMemberRole(
  companyId: string,
  memberId: string,
  role: MembershipRole,
): Promise<TeamMember> {
  return apiRequest<TeamMember>(endpoints.team.member(companyId, memberId), {
    method: 'PATCH',
    body: { role },
  });
}

export function removeTeamMember(
  companyId: string,
  memberId: string,
): Promise<RemoveTeamMemberResponse> {
  return apiRequest<RemoveTeamMemberResponse>(
    endpoints.team.member(companyId, memberId),
    { method: 'DELETE' },
  );
}
