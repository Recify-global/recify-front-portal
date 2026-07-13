import { cn } from '@/lib/utils';

const RECEIPT_LINES = ['70%', '45%', '85%', '60%', '40%'] as const;

interface TicketScanAnimationProps {
  className?: string;
}

/**
 * Animación de escaneo mientras se procesa el ticket: un recibo estilizado
 * con un haz que lo recorre verticalmente, dentro de un visor con esquinas.
 * Sin texto visible; el estado se comunica por aria-label.
 */
export function TicketScanAnimation({ className }: TicketScanAnimationProps) {
  return (
    <div
      role="status"
      aria-label="Procesando ticket"
      className={cn('relative mx-auto h-40 w-32', className)}
    >
      {/* Esquinas del visor */}
      <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-primary/70 animate-pulse-soft" />
      <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-primary/70 animate-pulse-soft" />
      <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-primary/70 animate-pulse-soft" />
      <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-primary/70 animate-pulse-soft" />

      {/* Recibo */}
      <div className="absolute inset-3 overflow-hidden rounded-lg border border-border bg-card shadow-elegant">
        <div className="space-y-2.5 p-3.5 pt-4">
          <div className="mx-auto h-2 w-1/2 rounded-full bg-muted-foreground/25" />
          {RECEIPT_LINES.map((width, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full bg-muted animate-pulse-soft"
              style={{ width, animationDelay: `${i * 180}ms` }}
            />
          ))}
          <div className="flex items-center justify-between pt-1">
            <div className="h-1.5 w-1/4 rounded-full bg-muted animate-pulse-soft" />
            <div className="h-2 w-1/3 rounded-full bg-primary/30 animate-pulse-soft" />
          </div>
        </div>

        {/* Haz de escaneo */}
        <div
          className="pointer-events-none absolute inset-x-0 h-14 animate-scan-y"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent, hsl(var(--primary) / 0.16))',
          }}
        >
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary shadow-[0_0_10px_2px_hsl(var(--primary)/0.45)]" />
        </div>
      </div>
    </div>
  );
}
