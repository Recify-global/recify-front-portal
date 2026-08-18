import type { UserStatus } from '@/types/auth';
import type { TeamMember, TeamRole } from '@/types/team';
import { TeamMappingError } from '@/utils/team-errors';

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isTeamRole(value: unknown): value is TeamRole {
  return value === 'admin' || value === 'user';
}

function asStatus(value: unknown): UserStatus | null {
  if (value === 'active' || value === 'inactive' || value === 'suspended') {
    return value;
  }
  return null;
}

/**
 * Normaliza un integrante desconocido al contrato de presentación.
 * Rechaza roles que no sean `admin | user` (no mapea accountant/viewer).
 */
export function toTeamMember(raw: unknown): TeamMember {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TeamMappingError();
  }

  const row = raw as Record<string, unknown>;
  const id = asString(row.id) ?? asString(row._id);
  const email = asString(row.email);
  if (!id || !email || !isTeamRole(row.role)) {
    throw new TeamMappingError();
  }

  const member: TeamMember = {
    id,
    email,
    role: row.role,
  };

  const name = asString(row.name);
  if (name) member.name = name;

  const firstName = asString(row.firstName);
  if (firstName) member.firstName = firstName;

  const lastName = asString(row.lastName);
  if (lastName) member.lastName = lastName;

  const avatarUrl = asString(row.avatarUrl);
  if (avatarUrl) member.avatarUrl = avatarUrl;

  const status = asStatus(row.status);
  if (status) member.status = status;

  return member;
}

export function toTeamMemberList(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) {
    throw new TeamMappingError();
  }
  return raw.map((item) => toTeamMember(item));
}
