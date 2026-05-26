import { FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketImagePreviewProps {
  imageUrl?: string | null;
  alt?: string;
  className?: string;
}

export function TicketImagePreview({ imageUrl, alt = 'Imagen del ticket', className }: TicketImagePreviewProps) {
  const validUrl = typeof imageUrl === 'string' && imageUrl.trim().length > 0 ? imageUrl.trim() : null;

  if (!validUrl) {
    return (
      <div
        className={cn(
          'flex h-44 items-center justify-center rounded-2xl bg-muted flex-col gap-2',
          className,
        )}
        aria-label="Sin imagen de ticket"
      >
        <FileImage size={36} className="text-muted-foreground opacity-40" />
        <span className="text-xs text-muted-foreground">Sin imagen</span>
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
        onError={(e) => {
          const wrapper = (e.currentTarget as HTMLImageElement).closest('a');
          if (wrapper) {
            wrapper.innerHTML = `
              <div class="flex h-44 flex-col items-center justify-center gap-2 text-muted-foreground">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-40"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 9 4-4 4 4 5-5 5 5"/><circle cx="8.5" cy="13.5" r="1.5"/></svg>
                <span class="text-xs">Imagen no disponible</span>
              </div>
            `;
          }
        }}
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
