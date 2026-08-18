import type { TeamMember, TeamRole } from '@/types/team';
import { TeamContractUnavailableError } from '@/utils/team-errors';

function requireCompanyId(companyId: string): void {
  if (!companyId) {
    throw new Error('No hay compañía activa.');
  }
}

/**
 * Integración futura de Mi equipo.
 *
 * No llama `apiRequest` ni inventa una URL. Cuando backend publique el contrato,
 * implementar estas funciones con `endpoints` + `apiRequest` y pasar el payload
 * por `toTeamMember` / `toTeamMemberList`.
 */
export async function listTeamMembers(
  companyId: string,
  _opts: { signal?: AbortSignal } = {},
): Promise<TeamMember[]> {
  requireCompanyId(companyId);
  throw new TeamContractUnavailableError();
}

export async function updateTeamMemberRole(
  companyId: string,
  memberId: string,
  role: TeamRole,
  _opts: { signal?: AbortSignal } = {},
): Promise<TeamMember> {
  requireCompanyId(companyId);
  if (!memberId) {
    throw new Error('Falta el integrante a actualizar.');
  }
  if (role !== 'admin' && role !== 'user') {
    throw new Error('El rol no es válido.');
  }
  throw new TeamContractUnavailableError('No se pudo actualizar el rol por ahora.');
}
