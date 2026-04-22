import { useQuery } from '@tanstack/react-query';
import {
  getTicket,
  listTickets,
} from '@/services/tickets.service';
import type { TicketsListParams } from '@/types/ticket';
import { useAuth } from './use-auth';

export function useTickets(params: TicketsListParams = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['tickets', companyId, params],
    queryFn: () => listTickets(companyId as string, params),
    enabled: Boolean(companyId),
  });
}

export function useTicket(id: string | null | undefined) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['ticket', companyId, id],
    queryFn: () => getTicket(companyId as string, id as string),
    enabled: Boolean(companyId) && Boolean(id),
  });
}
