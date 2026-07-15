import { cn } from '@/lib/utils';
import type { InvoiceMatchStatus } from '@/types/invoice';
import { INVOICE_MATCH_STATUS_LABELS } from '@/utils/invoice-display';

interface InvoiceMatchStatusBadgeProps {
  status: InvoiceMatchStatus;
  className?: string;
}

const STATUS_CLASSES: Record<InvoiceMatchStatus, string> = {
  unmatched: 'bg-warning/10 text-warning',
  suggested: 'bg-primary/10 text-primary',
  auto: 'bg-accent text-accent-foreground',
  confirmed: 'bg-accent text-accent-foreground',
  missing_ticket: 'bg-muted text-muted-foreground',
};

export function InvoiceMatchStatusBadge({ status, className }: InvoiceMatchStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        STATUS_CLASSES[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {INVOICE_MATCH_STATUS_LABELS[status] ?? status}
    </span>
  );
}
