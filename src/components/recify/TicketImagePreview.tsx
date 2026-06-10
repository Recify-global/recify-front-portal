import { useEffect, useState } from 'react';
import { FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketImagePreviewProps {
  imageUrl?: string | null;
  alt?: string;
  className?: string;
}

export function TicketImagePreview({ imageUrl, alt = 'Imagen del ticket', className }: TicketImagePreviewProps) {
  const [hasError, setHasError] = useState(false);
  const validUrl = typeof imageUrl === 'string' && imageUrl.trim().length > 0 ? imageUrl.trim() : null;

  useEffect(() => {
    setHasError(false);
  }, [validUrl]);

  if (!validUrl || hasError) {
    return (
      <div
        className={cn(
          'flex h-44 items-center justify-center rounded-2xl bg-muted flex-col gap-2',
          className,
        )}
        aria-label={validUrl ? 'Imagen de ticket no disponible' : 'Sin imagen de ticket'}
      >
        <FileImage size={36} className="text-muted-foreground opacity-40" />
        <span className="text-xs text-muted-foreground">
          {validUrl ? 'Imagen no disponible' : 'Sin imagen'}
        </span>
      </div>
    );
  }

  return (
    <a
      href={validUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver imagen completa"
      aria-label="Ver imagen del ticket en nueva pestaña"
      className={cn(
        'group relative block h-44 w-full overflow-hidden rounded-2xl border border-border/50 bg-muted',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <img
        src={validUrl}
        alt={alt}
        onError={() => setHasError(true)}
        className="h-full w-full object-cover blur-[2px] brightness-90 transition-all duration-200 group-hover:blur-0 group-hover:brightness-100"
      />
      <span className="absolute inset-0 flex items-end justify-center pb-3 opacity-100 transition-opacity group-hover:opacity-0">
        <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
          Ver imagen completa
        </span>
      </span>
    </a>
  );
}
