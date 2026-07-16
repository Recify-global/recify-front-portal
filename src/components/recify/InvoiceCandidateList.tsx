import { Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BackendTicket } from '@/types/ticket';
import type { InvoiceMatchCandidate } from '@/types/invoice';
import {
  formatInvoiceDate,
  formatInvoiceMatchReason,
  invoiceTicketRefId,
  invoiceTicketRefObject,
  isHighConfidenceScore,
} from '@/utils/invoice-display';
import { formatMxn } from '@/utils/financial-kpis';
import { cn } from '@/lib/utils';

interface InvoiceCandidateListProps {
  candidates: InvoiceMatchCandidate[];
  onConfirm: (ticketId: string) => void;
  confirmingTicketId?: string | null;
  disabled?: boolean;
}

function candidateTicket(candidate: InvoiceMatchCandidate): BackendTicket | null {
  return candidate.ticket ?? invoiceTicketRefObject(candidate.ticketId);
}

function candidateTicketId(candidate: InvoiceMatchCandidate): string | null {
  return invoiceTicketRefId(candidate.ticket?._id ?? candidate.ticketId);
}

export function InvoiceCandidateList({
  candidates,
  onConfirm,
  confirmingTicketId,
  disabled,
}: InvoiceCandidateListProps) {
  if (candidates.length === 0) return null;

  return (
    <ul className="space-y-2">
      {candidates.map((candidate, index) => {
        const ticket = candidateTicket(candidate);
        const ticketId = candidateTicketId(candidate);
        const confirming = Boolean(ticketId) && confirmingTicketId === ticketId;
        const vendor =
          ticket?.vendor ?? ticket?.rawData?.vendor ?? 'Ticket sin comercio';
        return (
          <li
            key={ticketId ?? `candidate-${index}`}
            className="rounded-xl border border-border/50 bg-background p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{vendor}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket
                    ? `${formatInvoiceDate(ticket.date)} · ${formatMxn(ticket.amount)}`
                    : `Ticket ${ticketId ?? 'desconocido'}`}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  isHighConfidenceScore(candidate.score)
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {candidate.score} pts
              </span>
            </div>
            {candidate.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {candidate.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                  >
                    {formatInvoiceMatchReason(reason)}
                  </span>
                ))}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-lg"
              disabled={disabled || !ticketId || confirming}
              onClick={() => {
                if (ticketId) onConfirm(ticketId);
              }}
            >
              {confirming ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Link2 size={14} className="mr-1.5" />
              )}
              Vincular con este ticket
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
