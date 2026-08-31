import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

interface InvoicePdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  isLoading?: boolean;
  error?: string | null;
  title?: string;
  onRetry?: () => void;
}

export function InvoicePdfDialog({
  open,
  onOpenChange,
  pdfUrl,
  isLoading = false,
  error = null,
  title = 'Factura',
  onRetry,
}: InvoicePdfDialogProps) {
  const [frameFailed, setFrameFailed] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);

  useEffect(() => {
    setFrameFailed(false);
    setFrameLoaded(false);
  }, [pdfUrl, open]);

  const showError = Boolean(error) || frameFailed;
  const showFrame = Boolean(pdfUrl) && !showError;
  const showLoading = isLoading || (showFrame && !frameLoaded);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] flex-col gap-3 p-4 sm:p-6"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista del PDF de la factura. Cierra para volver al formulario.
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-muted/40">
          {showLoading ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cargando factura…</p>
            </div>
          ) : null}

          {showError ? (
            <div
              className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center"
              role="alert"
            >
              <p className="text-sm text-muted-foreground">No se pudo cargar la factura.</p>
              {onRetry ? (
                <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                  Reintentar
                </Button>
              ) : null}
            </div>
          ) : null}

          {showFrame ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title="Vista del PDF de la factura"
              className="h-full min-h-[12rem] w-full border-0 bg-background"
              onLoad={() => setFrameLoaded(true)}
              onError={() => setFrameFailed(true)}
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" aria-label="Cerrar visor de factura">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
