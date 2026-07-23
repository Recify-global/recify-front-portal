import { AlertCircle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Contenido a la derecha del encabezado (toggles, badges). */
  actions?: React.ReactNode;
  /** Resumen destacado bajo el título (ej. total del período). */
  highlight?: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  icon,
  actions,
  highlight,
  isLoading,
  isError,
  isEmpty,
  emptyMessage = 'Sin datos en el período seleccionado.',
  onRetry,
  footer,
  className,
  bodyClassName,
  children,
}: ChartCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col bg-card rounded-2xl border border-border/50 shadow-elegant p-5 animate-fade-in',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="p-2.5 rounded-xl bg-accent text-accent-foreground shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>

      {highlight && <div className="mt-4">{highlight}</div>}

      <div className={cn('mt-4 flex-1', bodyClassName)}>
        {isLoading ? (
          <ChartCardSkeleton />
        ) : isError ? (
          <ChartCardError onRetry={onRetry} />
        ) : isEmpty ? (
          <ChartCardEmpty message={emptyMessage} />
        ) : (
          children
        )}
      </div>

      {footer && !isLoading && !isError && !isEmpty && (
        <footer className="mt-4 pt-3 border-t border-border/50">{footer}</footer>
      )}
    </section>
  );
}

function ChartCardSkeleton() {
  return (
    <div className="flex h-full min-h-[220px] flex-col justify-end gap-2">
      <div className="flex items-end gap-2 h-full">
        {[60, 85, 45, 95, 70, 55, 80].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

function ChartCardError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center">
      <div className="p-3 rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle size={22} />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">
        No fue posible cargar esta métrica.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" className="rounded-xl" onClick={onRetry}>
          <RefreshCw size={14} className="mr-2" />
          Reintentar
        </Button>
      )}
    </div>
  );
}

function ChartCardEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center">
      <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <rect x="7" y="12" width="3" height="5" rx="0.5" />
          <rect x="12" y="8" width="3" height="9" rx="0.5" />
          <rect x="17" y="14" width="3" height="3" rx="0.5" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip reutilizable con estilo del tema                            */
/* ------------------------------------------------------------------ */

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltipBox({
  title,
  rows,
}: {
  title?: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 shadow-xl">
      {title && <p className="text-xs font-semibold text-foreground mb-1.5">{title}</p>}
      <div className="space-y-1">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {row.color && (
                <span
                  className="h-2 w-2 rounded-[3px] shrink-0"
                  style={{ backgroundColor: row.color }}
                />
              )}
              {row.label}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
