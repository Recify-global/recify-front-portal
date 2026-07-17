import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import { resolveTicketImageUrl } from '@/utils/ticket-image';

interface TicketImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  alt: string;
  title?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function TicketImageDialog({
  open,
  onOpenChange,
  imageUrl,
  alt,
  title = 'Imagen del ticket',
  onRetry,
  isRetrying = false,
}: TicketImageDialogProps) {
  const safeImageUrl = resolveTicketImageUrl(imageUrl);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [safeImageUrl, open]);

  return (
    <Dialog open={open && Boolean(safeImageUrl)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista completa de la imagen seleccionada.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-muted/40 p-2">
          <TicketImagePreview
            key={safeImageUrl}
            imageUrl={safeImageUrl}
            alt={alt}
            className="max-h-[70vh] border-0"
            plain
            onImageError={() => setImageFailed(true)}
            onImageLoad={() => setImageFailed(false)}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          {imageFailed && onRetry ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isRetrying}
              onClick={onRetry}
            >
              {isRetrying ? 'Reintentando…' : 'Reintentar'}
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
