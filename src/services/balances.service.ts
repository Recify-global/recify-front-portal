import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { Paginated } from '@/types/api';
import type { BackendBalance, BalancesListParams } from '@/types/balance';

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export async function listBalances(
  companyId: string,
  params: BalancesListParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<Paginated<BackendBalance>> {
  const url = `${endpoints.balances.list(companyId)}${toQueryString(
    params as Record<string, unknown>,
  )}`;
  return apiRequest<Paginated<BackendBalance>>(url, { signal: opts.signal });
}

export async function getBalance(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BackendBalance> {
  return apiRequest<BackendBalance>(endpoints.balances.byId(companyId, id), {
    signal: opts.signal,
  });
}

export async function deleteBalance(
  companyId: string,
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  await apiRequest<void>(endpoints.balances.byId(companyId, id), {
    method: 'DELETE',
    signal: opts.signal,
  });
}
