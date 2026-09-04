import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { deleteBalance, listBalances } from '@/services/balances.service';
import type { BalancesListParams } from '@/types/balance';
import { useAuth } from './use-auth';

export const BALANCE_LIST_QUERY_ROOT = 'balances' as const;

export const balanceKeys = {
  company: (companyId: string) => [BALANCE_LIST_QUERY_ROOT, companyId] as const,
  list: (companyId: string, params: BalancesListParams = {}) =>
    [BALANCE_LIST_QUERY_ROOT, companyId, params] as const,
};

/** Invalida los listados de saldos de la compañía (p. ej. tras subir uno nuevo). */
export async function invalidateBalanceQueries(queryClient: QueryClient, companyId: string) {
  if (!companyId) return;
  await queryClient.invalidateQueries({ queryKey: balanceKeys.company(companyId) });
}

export function useBalances(params: BalancesListParams = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: balanceKeys.list(companyId ?? '', params),
    queryFn: ({ signal }) => listBalances(companyId as string, params, { signal }),
    enabled: Boolean(companyId),
  });
}

export function useDeleteBalance() {
  const queryClient = useQueryClient();
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => deleteBalance(companyId as string, id),
    onSuccess: () => invalidateBalanceQueries(queryClient, companyId ?? ''),
  });
}
