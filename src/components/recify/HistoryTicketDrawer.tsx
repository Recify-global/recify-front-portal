import { CategoryBadge } from './CategoryBadge';
import { StatusBadge } from './StatusBadge';
import { TicketImagePreview } from './TicketImagePreview';
import { TicketNotes } from './TicketNotes';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatMxn } from '@/utils/financial-kpis';
import { formatTicketDateTime } from '@/utils/ticket-display';
import type { UiTicket } from '@/types/ticket';

interface HistoryTicketDrawerProps {
  ticket: UiTicket | null;
  noteSources: unknown[];
  imageLoading?: boolean;
  detailFetching?: boolean;
  detailError?: boolean;
  onClose: () => void;
}

export function HistoryTicketDrawer({
  ticket,
  noteSources,
  imageLoading = false,
  detailFetching = false,
  detailError = false,
  onClose,
}: HistoryTicketDrawerProps) {
  return (
    <Sheet
      open={Boolean(ticket)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {ticket ? (
          <div className="space-y-5">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span className="text-foreground">{ticket.comercio}</span>
                <StatusBadge status={ticket.estatus} />
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detalle de consulta del ticket seleccionado.
              </SheetDescription>
            </SheetHeader>

            <TicketImagePreview
              imageUrl={ticket.imagenUrl}
              alt={`Ticket de ${ticket.comercio}`}
              loading={imageLoading}
            />

            <div className="grid grid-cols-2 gap-3">
              {[
                ...(ticket.folio ? [{ label: 'Folio', value: ticket.folio }] : []),
                {
                  label: 'Fecha y hora',
                  value: formatTicketDateTime(ticket.fecha, ticket.hora),
                },
                { label: 'Subtotal', value: formatMxn(ticket.subtotal) },
                { label: 'IVA', value: formatMxn(ticket.iva) },
                { label: 'Total', value: formatMxn(ticket.total) },
                { label: 'Moneda', value: 'MXN' },
                { label: 'Método de pago', value: ticket.metodoPago },
                { label: 'Tipo', value: ticket.tipo },
                { label: 'Estatus', value: ticket.estatus },
              ].map((field) => (
                <div key={field.label}>
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="text-sm font-medium text-foreground">{field.value}</p>
                </div>
              ))}
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Categoría</p>
                <CategoryBadge category={ticket.categoria} />
              </div>
            </div>

            <TicketNotes title="Productos y notas detectadas" sources={noteSources} />

            {detailFetching ? (
              <p className="text-xs text-muted-foreground">Actualizando...</p>
            ) : null}
            {detailError ? (
              <p className="text-xs text-destructive">No se pudo cargar el detalle completo.</p>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
