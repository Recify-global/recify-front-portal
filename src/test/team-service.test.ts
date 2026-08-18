import { describe, expect, it, vi } from 'vitest';
import { listTeamMembers, updateTeamMemberRole } from '@/services/team.service';
import { TeamContractUnavailableError } from '@/utils/team-errors';

describe('team.service integration point', () => {
  it('does not fetch an invented members URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(listTeamMembers('company-a')).rejects.toBeInstanceOf(
      TeamContractUnavailableError,
    );
    await expect(updateTeamMemberRole('company-a', 'u1', 'admin')).rejects.toBeInstanceOf(
      TeamContractUnavailableError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('requires a company id before doing any work', async () => {
    await expect(listTeamMembers('')).rejects.toThrow('No hay compañía activa.');
    await expect(updateTeamMemberRole('', 'u1', 'user')).rejects.toThrow(
      'No hay compañía activa.',
    );
  });
});
