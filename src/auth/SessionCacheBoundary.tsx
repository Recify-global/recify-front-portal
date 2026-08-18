import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getActiveClosingGeneration,
  registerSessionCacheCleanup,
  shouldFinalizeSessionCleanup,
} from '@/auth/session-cleanup';
import {
  getStoredCompanyId,
  subscribeAuthChanges,
} from '@/auth/storage';
import {
  INVOICE_DETAIL_QUERY_ROOT,
  INVOICE_LIST_QUERY_ROOT,
} from '@/utils/invoice-queries';
import {
  TICKET_DETAIL_QUERY_ROOT,
  TICKET_LIST_QUERY_ROOT,
} from '@/utils/ticket-queries';
import { TEAM_MEMBERS_QUERY_ROOT } from '@/utils/team-queries';

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

      // clear() elimina QueryCache y MutationCache.
      queryClient.clear();
    });
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
        void queryClient.cancelQueries({
          queryKey: [TICKET_LIST_QUERY_ROOT, previousCompanyId],
        });
        void queryClient.cancelQueries({
          queryKey: [TICKET_DETAIL_QUERY_ROOT, previousCompanyId],
        });
        void queryClient.cancelQueries({
          queryKey: [INVOICE_LIST_QUERY_ROOT, previousCompanyId],
        });
        void queryClient.cancelQueries({
          queryKey: [INVOICE_DETAIL_QUERY_ROOT, previousCompanyId],
        });
        void queryClient.cancelQueries({
          queryKey: ['dashboard-daily-report', previousCompanyId],
        });
        void queryClient.cancelQueries({
          queryKey: [TEAM_MEMBERS_QUERY_ROOT, previousCompanyId],
        });
      }

      previousCompanyIdRef.current = nextCompanyId;
    });
  }, [queryClient]);

  return null;
}
