import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/api/http';
import {
  TeamContractUnavailableError,
  getTeamUserErrorMessage,
  shouldRetryTeamQuery,
} from '@/utils/team-errors';

describe('team errors', () => {
  it('does not expose technical messages from 5xx', () => {
    const err = new ApiRequestError('ECONNRESET at src/services/team.service.ts', 500);
    expect(getTeamUserErrorMessage(err, 'fallback')).toBe(
      'El servicio no está disponible por ahora. Intenta más tarde.',
    );
    expect(getTeamUserErrorMessage(err, 'fallback')).not.toMatch(/ECONNRESET|team.service/);
  });

  it('does not retry an unpublished contract', () => {
    expect(shouldRetryTeamQuery(0, new TeamContractUnavailableError())).toBe(false);
    expect(shouldRetryTeamQuery(0, new ApiRequestError('nope', 403))).toBe(false);
  });
});
