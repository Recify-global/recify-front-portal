import { useState } from 'react';
import { FileImage, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveTicketImageUrl } from '@/utils/ticket-image';

interface TicketImagePreviewProps {
  imageUrl?: string | null;
  /** Preview local usado si una URL persistente no puede cargarse. */
  fallbackImageUrl?: string | null;
  /** Evita mostrar "Sin imagen" mientras las fuentes remotas siguen cargando. */
  loading?: boolean;
  /** Muestra la imagen completa y nítida (sin blur ni recorte), p.ej. en un diálogo. */
  plain?: boolean;
  alt?: string;
  className?: string;
}

export function TicketImagePreview({
  imageUrl,
  fallbackImageUrl,
  loading = false,
  plain = false,
  alt = 'Imagen del ticket',
  className,
}: TicketImagePreviewProps) {
  const primaryUrl = resolveTicketImageUrl(imageUrl);
  const fallbackUrl = resolveTicketImageUrl(fallbackImageUrl);
  const [failedPrimaryUrl, setFailedPrimaryUrl] = useState<string | null>(null);
  const [failedFallbackUrl, setFailedFallbackUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const currentUrl =
    primaryUrl && failedPrimaryUrl !== primaryUrl
      ? primaryUrl
      : fallbackUrl && failedFallbackUrl !== fallbackUrl
        ? fallbackUrl
        : null;
  const hadSource = Boolean(primaryUrl || fallbackUrl);
  const hasError = hadSource && !currentUrl;
  const isImageLoading = Boolean(currentUrl && loadedUrl !== currentUrl);

  if (!currentUrl && loading) {
    return (
      <div
        className={cn(
          'flex h-44 items-center justify-center rounded-2xl bg-muted',
          className,
        )}
        aria-label="Cargando imagen del ticket"
      >
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentUrl || hasError) {
    return (
      <div
        className={cn(
          'flex h-44 items-center justify-center rounded-2xl bg-muted flex-col gap-2',
          className,
        )}
        aria-label={hasError ? 'Imagen de ticket no disponible' : 'Sin imagen de ticket'}
      >
        <FileImage size={36} className="text-muted-foreground opacity-40" />
        <span className="text-xs text-muted-foreground">
          {hasError ? 'No fue posible cargar la imagen.' : 'Sin imagen'}
        </span>
      </div>
    );
  }

  return (
    <a
      href={currentUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver imagen completa"
      aria-label="Ver imagen del ticket en nueva pestaña"
      className={cn(
        'group relative block w-full overflow-hidden rounded-2xl border border-border/50 bg-muted',
        plain ? 'h-auto min-h-44' : 'h-44',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      {isImageLoading ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </span>
      ) : null}
      <img
        key={currentUrl}
        src={currentUrl}
        alt={alt}
        onLoad={() => setLoadedUrl(currentUrl)}
        onError={() => {
          if (currentUrl === primaryUrl) {
            setFailedPrimaryUrl(primaryUrl);
          } else {
            setFailedFallbackUrl(currentUrl);
          }
        }}
        className={cn(
          'w-full transition-all duration-200',
          plain
            ? 'h-auto object-contain'
            : 'h-full object-cover blur-[2px] brightness-90 group-hover:blur-0 group-hover:brightness-100',
        )}
      />
      {plain ? null : (
        <span className="absolute inset-0 flex items-end justify-center pb-3 opacity-100 transition-opacity group-hover:opacity-0">
          <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
            Ver imagen completa
          </span>
        </span>
      )}
    </a>
  );
}
