import type { UserStatus } from '@/types/auth';

/**
 * Roles de producto para Mi equipo.
 * No reutiliza `UserRole` global (`admin | accountant | viewer`):
 * esa unión pertenece a la sesión y no está confirmada como rol de compañía.
 */
export type TeamRole = 'admin' | 'user';

export const TEAM_ROLES: readonly TeamRole[] = ['admin', 'user'] as const;

/**
 * Miembro de la compañía activa. Tipo de presentación de esta feature.
 * `AuthUser` no modela un listado de integrantes; por eso este contrato es local.
 *
 * Campos opcionales: el backend aún no los entrega. La UI debe tolerar su ausencia.
 */
export interface TeamMember {
  id: string;
  email: string;
  role: TeamRole;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  status?: UserStatus | null;
}
