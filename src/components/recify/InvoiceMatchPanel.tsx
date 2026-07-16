import { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Link2Off, Loader2, RefreshCw, SearchX, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InvoiceCandidateList } from '@/components/recify/InvoiceCandidateList';
import {
  useConfirmInvoiceMatch,
  useRecalculateMatchCandidates,
  useUnlinkInvoiceMatch,
  useUpdateInvoiceMatchStatus,
} from '@/hooks/use-invoices';
import type { BackendInvoice, InvoiceMatchCandidate } from '@/types/invoice';
import type { BackendTicket } from '@/types/ticket';
import {
  formatInvoiceDate,
  invoiceTicketRefObject,
  isInvoiceLinked,
} from '@/utils/invoice-display';
import { formatMxn } from '@/utils/financial-kpis';
import { ApiRequestError } from '@/api/http';

interface InvoiceMatchPanelProps {
  invoice: BackendInvoice;
  /** Ticket enlazado ya populado (detalle o respuesta del upload). */
  linkedTicket?: BackendTicket | null;
  /** Candidatos iniciales (del upload o del detalle populado). */
  initialCandidates?: InvoiceMatchCandidate[];
  /** Notifica a la vista dueña la factura actualizada tras cada acción. */
  onInvoiceChange?: (invoice: BackendInvoice) => void;
}

function extractError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError || err instanceof Error) return err.message || fallback;
  return fallback;
}

export function InvoiceMatchPanel({
  invoice,
  linkedTicket,
  initialCandidates,
  onInvoiceChange,
}: InvoiceMatchPanelProps) {
  const [candidates, setCandidates] = useState<InvoiceMatchCandidate[]>(
    initialCandidates ?? invoice.matchCandidates ?? [],
  );
  const [confirmingTicketId, setConfirmingTicketId] = useState<string | null>(null);
  // Ticket confirmado en esta sesión; pisa al `linkedTicket` original si el
  // usuario desvinculó y volvió a vincular con otro ticket.
  const [sessionTicket, setSessionTicket] = useState<BackendTicket | null>(null);

  const confirmMutation = useConfirmInvoiceMatch();
  const unlinkMutation = useUnlinkInvoiceMatch();
  const statusMutation = useUpdateInvoiceMatchStatus();
  const recalcMutation = useRecalculateMatchCandidates();

  useEffect(() => {
    setCandidates(initialCandidates ?? invoice.matchCandidates ?? []);
  }, [invoice._id, invoice.matchStatus, initialCandidates, invoice.matchCandidates]);

  const busy =
    confirmMutation.isPending ||
    unlinkMutation.isPending ||
    statusMutation.isPending ||
    recalcMutation.isPending;

  const ticket = sessionTicket ?? invoiceTicketRefObject(invoice.ticketId) ?? linkedTicket;

  const handleConfirm = async (ticketId: string) => {
    setConfirmingTicketId(ticketId);
    try {
      const result = await confirmMutation.mutateAsync({ invoiceId: invoice._id, ticketId });
      toast.success('Factura vinculada al ticket.');
      setSessionTicket(result.ticket ?? null);
      onInvoiceChange?.(result.invoice);
    } catch (err) {
      toast.error(extractError(err, 'No se pudo vincular la factura.'));
    } finally {
      setConfirmingTicketId(null);
    }
  };

  const handleUnlink = async () => {
    try {
      const updated = await unlinkMutation.mutateAsync({ invoiceId: invoice._id });
      toast.success('Factura desvinculada del ticket.');
      setSessionTicket(null);
      onInvoiceChange?.(updated);
    } catch (err) {
      toast.error(extractError(err, 'No se pudo desvincular la factura.'));
    }
  };

  const handleMarkMissing = async () => {
    try {
      const updated = await statusMutation.mutateAsync({
        invoiceId: invoice._id,
        matchStatus: 'missing_ticket',
      });
      toast.success('Factura marcada como ticket faltante.');
      onInvoiceChange?.(updated);
    } catch (err) {
      toast.error(extractError(err, 'No se pudo marcar la factura.'));
    }
  };

  const handleRevertMissing = async () => {
    try {
      const updated = await statusMutation.mutateAsync({
        invoiceId: invoice._id,
        matchStatus: 'unmatched',
      });
      toast.success('La factura volvió a "Sin ticket".');
      onInvoiceChange?.(updated);
    } catch (err) {
      toast.error(extractError(err, 'No se pudo actualizar la factura.'));
    }
  };

  const handleRecalculate = async () => {
    try {
      const response = await recalcMutation.mutateAsync({ invoiceId: invoice._id });
      setCandidates(response.candidates);
      if (response.candidates.length === 0) {
        toast.info('No encontramos tickets que coincidan con esta factura.');
      }
    } catch (err) {
      toast.error(extractError(err, 'No se pudieron buscar tickets.'));
    }
  };

  if (isInvoiceLinked(invoice)) {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 size={18} />
          <p className="text-sm font-medium text-foreground">
            {invoice.matchStatus === 'auto'
              ? 'Factura vinculada automáticamente a un ticket'
              : 'Factura vinculada (confirmada)'}
          </p>
        </div>
        {ticket ? (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p className="font-medium text-foreground">
              {ticket.vendor ?? ticket.rawData?.vendor ?? 'Ticket sin comercio'}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatInvoiceDate(ticket.date)} · {formatMxn(ticket.amount)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            El detalle del ticket vinculado se muestra en el Histórico.
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={handleUnlink}
          disabled={busy}
        >
          {unlinkMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Link2Off size={14} className="mr-1.5" />
          )}
          Desvincular
        </Button>
      </div>
    );
  }

  if (invoice.matchStatus === 'suggested') {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-primary" />
          <p className="text-sm font-medium text-foreground">
            ¿Corresponde a alguno de estos tickets?
          </p>
        </div>
        <InvoiceCandidateList
          candidates={candidates}
          onConfirm={(ticketId) => void handleConfirm(ticketId)}
          confirmingTicketId={confirmingTicketId}
          disabled={busy}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg text-muted-foreground"
          onClick={handleMarkMissing}
          disabled={busy}
        >
          Ninguno corresponde — marcar ticket faltante
        </Button>
      </div>
    );
  }

  if (invoice.matchStatus === 'missing_ticket') {
    return (
      <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <SearchX size={18} />
          <p className="text-sm font-medium text-foreground">
            Marcada como ticket faltante: el matcher ya no la considera.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={handleRevertMissing}
          disabled={busy}
        >
          {statusMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Undo2 size={14} className="mr-1.5" />
          )}
          Volver a "Sin ticket"
        </Button>
      </div>
    );
  }

  // unmatched
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-warning">
        <SearchX size={18} />
        <p className="text-sm font-medium text-foreground">
          No encontramos un ticket para esta factura.
        </p>
      </div>
      {candidates.length > 0 && (
        <InvoiceCandidateList
          candidates={candidates}
          onConfirm={(ticketId) => void handleConfirm(ticketId)}
          confirmingTicketId={confirmingTicketId}
          disabled={busy}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={handleRecalculate}
          disabled={busy}
        >
          {recalcMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-1.5" />
          )}
          Buscar tickets
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          onClick={handleMarkMissing}
          disabled={busy}
        >
          {statusMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : null}
          Marcar ticket faltante
        </Button>
      </div>
    </div>
  );
}
