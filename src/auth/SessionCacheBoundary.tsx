import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  abortInFlightLogout,
  getActiveClosingGeneration,
  markAuthSessionActive,
  registerSessionCacheCleanup,
  shouldFinalizeSessionCleanup,
} from '@/auth/session-cleanup';
import {
  AUTH_STORAGE_KEYS,
  adoptRemoteLogout,
  getStoredCompanyId,
  setProbeBlocked,
  subscribeAuthChanges,
} from '@/auth/storage';
import { probeSession } from '@/auth/session-probe';

/**
 * Conecta el coordinador de sesión con la misma instancia de QueryClient
 * entregada por QueryClientProvider.
 *
 * También cancela queries in-flight de la compañía anterior al cambiar de tenant,
 * sin borrar el caché aislado (las keys ya incluyen companyId).
 */
export function SessionCacheBoundary() {
  const queryClient = useQueryClient();
  const previousCompanyIdRef = useRef<string | null>(getStoredCompanyId());

  useEffect(() => {
    return registerSessionCacheCleanup(async () => {
      const closingGeneration = getActiveClosingGeneration();
      if (closingGeneration === null) return;
      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;

      await queryClient.cancelQueries();
      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;

      queryClient.clear();
    });
  }, [queryClient]);

  useEffect(() => {
    void probeSession();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEYS.sessionSignal) return;
      if (event.newValue?.startsWith('out')) {
        adoptRemoteLogout();
        markAuthSessionActive();
        void queryClient.cancelQueries().finally(() => {
          queryClient.clear();
        });
        return;
      }
      if (event.newValue?.startsWith('in')) {
        abortInFlightLogout();
        setProbeBlocked(false);
        markAuthSessionActive();
        void probeSession({ force: true });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  useEffect(() => {
    return subscribeAuthChanges(() => {
      const nextCompanyId = getStoredCompanyId();
      const previousCompanyId = previousCompanyIdRef.current;

      if (
        previousCompanyId &&
        nextCompanyId &&
        previousCompanyId !== nextCompanyId
      ) {
        void queryClient
          .cancelQueries({
            predicate: (query) => query.queryKey.includes(previousCompanyId),
          })
          .then(() => {
            queryClient.removeQueries({
              predicate: (query) => query.queryKey.includes(previousCompanyId),
            });
          });
      }

      previousCompanyIdRef.current = nextCompanyId;
    });
  }, [queryClient]);

  return null;
}
