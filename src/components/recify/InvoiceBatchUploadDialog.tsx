import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Receipt, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useInvoiceBatchUpload,
  type InvoiceBatchItem,
  type InvoiceBatchStatus,
} from '@/hooks/use-invoice-batch-upload';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
  type AuthMutationContext,
} from '@/auth/session-cleanup';
import { invalidateInvoiceQueries, writeInvoiceCache } from '@/utils/invoice-queries';
import { INVOICE_PDF_ACCEPT } from '@/utils/invoice-file';
import type { BackendInvoice } from '@/types/invoice';

interface InvoiceBatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABEL: Record<InvoiceBatchStatus, string> = {
  pending: 'Pendiente',
  uploading: 'Procesando',
  saved: 'Completada',
  error: 'Error',
};

export function InvoiceBatchUploadDialog({ open, onOpenChange }: InvoiceBatchUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const {
    items,
    maxFiles,
    pendingCount,
    isUploading,
    addFiles,
    removeItem,
    retryItem,
    uploadAll,
    clear,
  } = useInvoiceBatchUpload();

  useEffect(() => {
    if (!open) {
      clear();
      setSubmitting(false);
    }
  }, [open, clear]);

  const busy = submitting || isUploading;

  const handleAdd = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || busy) return;
      const result = await addFiles(files);
      if (result.rejected.length === 0) return;
      toast.error(
        result.rejected.length === 1
          ? `${result.rejected[0].file.name}: ${result.rejected[0].reason}`
          : `Se rechazaron ${result.rejected.length} archivos.`,
      );
    },
    [addFiles, busy],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (busy) return;
    void handleAdd(event.dataTransfer.files);
  };

  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    else if (event.type === 'dragleave') setDragActive(false);
  };

  const applyConfirmedSaves = useCallback(
    async (
      saved: Array<{ companyId: string; invoice: BackendInvoice }>,
      authContext: AuthMutationContext,
    ) => {
      if (!isAuthMutationContextCurrent(authContext)) return;
      const companies = new Set<string>();
      for (const entry of saved) {
        writeInvoiceCache(queryClient, entry.companyId, entry.invoice);
        companies.add(entry.companyId);
      }
      if (!isAuthMutationContextCurrent(authContext)) return;
      await Promise.all(
        Array.from(companies).map((companyId) =>
          invalidateInvoiceQueries(queryClient, companyId),
        ),
      );
    },
    [queryClient],
  );

  const handleUpload = async () => {
    if (busy || pendingCount === 0) {
      if (pendingCount === 0) toast.info('No hay facturas pendientes.');
      return;
    }
    const authContext = captureAuthMutationContext();
    setSubmitting(true);
    try {
      const result = await uploadAll();
      if (result.alreadyRunning || !isAuthMutationContextCurrent(authContext)) return;
      await applyConfirmedSaves(result.saved, authContext);
      if (!isAuthMutationContextCurrent(authContext)) return;
      if (result.saved.length > 0 && result.failed === 0) {
        toast.success(
          result.saved.length === 1
            ? 'Factura procesada correctamente.'
            : 'Facturas procesadas correctamente.',
        );
      } else if (result.saved.length > 0) {
        toast.success(
          `Se procesaron ${result.saved.length}. ${result.failed} no se pudieron guardar.`,
        );
      } else if (result.failed > 0) {
        toast.error('No se pudo procesar ninguna factura.');
      }
    } finally {
      if (isAuthMutationContextCurrent(authContext)) setSubmitting(false);
    }
  };

  const requestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    const hasPendingWork = items.some(
      (item) => item.status === 'pending' || item.status === 'uploading',
    );
    if (hasPendingWork) {
      const ok = window.confirm(
        'Hay facturas pendientes o en proceso. Si sales, se cancelará lo que todavía no se haya confirmado. ¿Salir de todos modos?',
      );
      if (!ok) return;
    }
    onOpenChange(false);
  };

  const slotsLeft = maxFiles - items.length;
  const allSaved = items.length > 0 && items.every((item) => item.status === 'saved');

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir varias facturas</DialogTitle>
          <DialogDescription>
            Hasta {maxFiles} PDF. Cada factura se envía por separado y solo se marca como
            completada cuando el servidor confirma que se guardó.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={INVOICE_PDF_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            void handleAdd(event.target.files);
            event.currentTarget.value = '';
          }}
        />

        {items.length === 0 ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all',
              dragActive
                ? 'border-primary bg-accent'
                : 'border-border hover:border-primary/50 hover:bg-accent/30',
            )}
          >
            <Receipt size={32} className="mx-auto text-muted-foreground" />
            <p className="mt-3 font-medium">Arrastra varias facturas aquí</p>
            <p className="text-sm text-muted-foreground">
              o haz clic para seleccionar (máximo {maxFiles})
            </p>
            <p className="mt-2 text-xs text-muted-foreground">PDF de CFDI — hasta 10 MB c/u</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                {items.length} / {maxFiles}
              </Badge>
              <StatusCount items={items} status="pending" icon={<Clock size={12} className="mr-1" />} />
              <StatusCount
                items={items}
                status="uploading"
                icon={<Loader2 size={12} className="mr-1 animate-spin" />}
              />
              <StatusCount
                items={items}
                status="saved"
                icon={<CheckCircle2 size={12} className="mr-1" />}
                className="text-emerald-600 dark:text-emerald-400"
              />
              <StatusCount
                items={items}
                status="error"
                icon={<AlertCircle size={12} className="mr-1" />}
                className="text-destructive"
              />
            </div>

            <ul className="flex-1 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/50">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        item.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {item.error ?? STATUS_LABEL[item.status]}
                    </p>
                  </div>
                  {item.status === 'error' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => retryItem(item.id)}
                    >
                      Reintentar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${item.file.name}`}
                    disabled={item.status === 'uploading' || busy}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </li>
              ))}
            </ul>

            {slotsLeft > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                disabled={busy}
              >
                <Upload size={16} className="mr-2" />
                Añadir más ({slotsLeft} disponibles)
              </Button>
            )}
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => clear()}
            disabled={items.length === 0 || busy}
            className="sm:order-1"
          >
            <Trash2 size={16} className="mr-2" /> Vaciar lista
          </Button>
          <div className="flex gap-2 sm:order-2">
            <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={busy}>
              {allSaved ? 'Cerrar' : 'Salir'}
            </Button>
            <Button type="button" onClick={() => void handleUpload()} disabled={pendingCount === 0 || busy}>
              {busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
              Subir facturas ({pendingCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusCount({
  items,
  status,
  icon,
  className,
}: {
  items: InvoiceBatchItem[];
  status: InvoiceBatchStatus;
  icon: ReactNode;
  className?: string;
}) {
  const count = items.filter((item) => item.status === status).length;
  if (count === 0) return null;
  return (
    <Badge variant="outline" className={className}>
      {icon}
      {count} {STATUS_LABEL[status].toLowerCase()}
    </Badge>
  );
}
