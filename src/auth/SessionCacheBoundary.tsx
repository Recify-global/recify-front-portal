import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getActiveClosingGeneration,
  registerSessionCacheCleanup,
  shouldFinalizeSessionCleanup,
} from '@/auth/session-cleanup';

/**
 * Conecta el coordinador de sesión con la misma instancia de QueryClient
 * entregada por QueryClientProvider.
 */
export function SessionCacheBoundary() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return registerSessionCacheCleanup(async () => {
      const closingGeneration = getActiveClosingGeneration();
      if (closingGeneration === null) return;
      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;

      await queryClient.cancelQueries();
      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;

      // clear() elimina QueryCache y MutationCache.
      queryClient.clear();
    });
  }, [queryClient]);

  return null;
}
