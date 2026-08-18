import type { UserStatus } from '@/types/auth';
import type { TeamMember, TeamRole } from '@/types/team';

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Administrador',
  user: 'Usuario',
};

export const TEAM_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  suspended: 'Suspendido',
};

function compact(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getTeamMemberDisplayName(member: TeamMember): string {
  const name = compact(member.name);
  if (name) return name;

  const composed = [compact(member.firstName), compact(member.lastName)]
    .filter(Boolean)
    .join(' ');
  if (composed) return composed;

  return member.email;
}

export function getTeamMemberInitials(member: TeamMember): string {
  const source = getTeamMemberDisplayName(member);
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (source.includes('@') && parts.length === 1) {
    return source.slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase() || '?';
}

export function isCurrentTeamMember(
  member: TeamMember,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(currentUserId) && member.id === currentUserId;
}
