import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { registerSessionCacheCleanup } from '@/auth/session-cleanup';

/**
 * Conecta el coordinador de sesión con la misma instancia de QueryClient
 * entregada por QueryClientProvider.
 */
export function SessionCacheBoundary() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return registerSessionCacheCleanup(async () => {
      try {
        await queryClient.cancelQueries();
      } finally {
        // clear() elimina QueryCache y MutationCache.
        queryClient.clear();
      }
    });
  }, [queryClient]);

  return null;
}
