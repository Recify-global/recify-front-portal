import { getMeRequest } from '@/services/auth.service';
import { ApiRequestError } from '@/api/http';
import {
  clearAuthSession,
  getAuthSessionGeneration,
  getClientSession,
  isCurrentAuthSessionGeneration,
  isProbeBlocked,
  markSessionForbidden,
  markSessionLoading,
  markSessionOffline,
  purgeLegacyJwt,
  setAuthSession,
  setProbeBlocked,
} from '@/auth/storage';

let inflight: Promise<void> | null = null;

/**
 * Confirma la sesión con GET /auth/me.
 * 401 cierra la sesión local. Un fallo de red no la convierte en logout.
 */
export function probeSession(options: { force?: boolean } = {}): Promise<void> {
  purgeLegacyJwt();
  if (isProbeBlocked() && !options.force) return Promise.resolve();
  const status = getClientSession().status;
  if (!options.force && (status === 'authenticated' || status === 'signing-out')) {
    return Promise.resolve();
  }
  if (inflight && !options.force) return inflight;

  const generation = getAuthSessionGeneration();
  if (options.force) setProbeBlocked(false);
  markSessionLoading();

  const task = (async () => {
    try {
      const { user } = await getMeRequest();
      if (!isCurrentAuthSessionGeneration(generation) || isProbeBlocked()) return;
      setAuthSession(user, { signal: false });
    } catch (err) {
      if (!isCurrentAuthSessionGeneration(generation) || isProbeBlocked()) return;
      if (err instanceof ApiRequestError && err.status === 401) {
        clearAuthSession({ advanceGeneration: false });
        return;
      }
      if (err instanceof ApiRequestError && err.status === 403) {
        markSessionForbidden();
        return;
      }
      markSessionOffline();
    }
  })();

  inflight = task.finally(() => {
    if (inflight === task) inflight = null;
  });
  return inflight;
}
