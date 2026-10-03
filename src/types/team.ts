import type { MembershipRole } from '@/types/auth';

export type TeamMemberKind = 'active' | 'pending';
export type TeamMemberStatus = 'active' | 'pending' | 'inactive' | 'suspended';

export interface TeamMember {
  id: string;
  userId: string | null;
  kind: TeamMemberKind;
  name: string;
  email: string;
  phone: string | null;
  rfc: string | null;
  role: MembershipRole;
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string;
}

export interface TeamMembersParams {
  search?: string;
  role?: MembershipRole;
  status?: Extract<TeamMemberStatus, 'active' | 'pending'>;
  page?: number;
  limit?: number;
}

export interface AddTeamMemberInput {
  name: string;
  email: string;
  phone: string;
  rfc?: string;
  role: MembershipRole;
}

export interface AddTeamMemberResponse {
  member: TeamMember;
}

export interface RemoveTeamMemberResponse {
  id: string;
  userId: string | null;
  kind: TeamMemberKind;
}
