import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listTickets } from '@/services/tickets.service';
import type { BackendTicket } from '@/types/ticket';
import type { BackendInvoiceType } from '@/types/invoice';
import { formatInvoiceDate } from '@/utils/invoice-display';
import { formatMxn } from '@/utils/financial-kpis';

interface ManualMatchPickerProps {
  companyId: string;
  /** Solo se listan tickets del mismo tipo que la factura. */
  invoiceType: BackendInvoiceType;
  onConfirm: (ticketId: string) => void;
  confirmingTicketId?: string | null;
  disabled?: boolean;
  timeZone?: string;
}

/**
 * Buscador manual de tickets para emparejar una factura cuando el matcher
 * automático no sugiere nada (o el usuario quiere otro). Lista los tickets del
 * mismo tipo aún NO vinculados, con búsqueda por comercio.
 */
export function ManualMatchPicker({
  companyId,
  invoiceType,
  onConfirm,
  confirmingTicketId,
  disabled,
  timeZone,
}: ManualMatchPickerProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['manual-match-tickets', companyId, invoiceType, debounced],
    queryFn: ({ signal }) =>
      listTickets(
        companyId,
        { type: invoiceType, unmatched: true, search: debounced || undefined, limit: 8 },
        { signal },
      ),
    enabled: Boolean(companyId),
  });

  const tickets: BackendTicket[] = data?.data ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ticket por comercio…"
          className="h-9 rounded-lg bg-background pl-9 text-sm"
          disabled={disabled}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Buscando tickets…
        </div>
      ) : isError ? (
        <p className="py-3 text-center text-xs text-destructive">
          No se pudieron cargar los tickets.
        </p>
      ) : tickets.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {debounced
            ? 'Ningún ticket coincide con la búsqueda.'
            : 'No hay tickets sin vincular de este tipo.'}
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {tickets.map((ticket) => {
            const confirming = confirmingTicketId === ticket._id;
            const vendor = ticket.vendor ?? ticket.rawData?.vendor ?? 'Ticket sin comercio';
            return (
              <li
                key={ticket._id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{vendor}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatInvoiceDate(ticket.date, timeZone)} · {formatMxn(ticket.amount)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-lg"
                  disabled={disabled || confirming}
                  onClick={() => onConfirm(ticket._id)}
                >
                  {confirming ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <Link2 size={14} className="mr-1.5" />
                  )}
                  Vincular
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
