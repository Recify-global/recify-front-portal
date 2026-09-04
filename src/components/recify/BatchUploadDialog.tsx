import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Save,
  Clock,
} from 'lucide-react';
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
import {
  useBatchUpload,
  type BatchItem,
  type BatchItemStatus,
} from '@/hooks/use-batch-upload';
import { cn } from '@/lib/utils';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
  type AuthMutationContext,
} from '@/auth/session-cleanup';
import { invalidateInvoiceQueries } from '@/utils/invoice-queries';
import { invalidateTicketDerivedQueries } from '@/utils/ticket-derived-queries';
import { invalidateBalanceQueries } from '@/hooks/use-balances';

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  queued: 'Pendiente',
  analyzing: 'Analizando',
  analyzed: 'Listo para guardar',
  saving: 'Guardando',
  saved: 'Guardado',
  error: 'Error',
};

function formatMXN(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function BatchUploadDialog({ open, onOpenChange }: BatchUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [savingBusy, setSavingBusy] = useState(false);
  const queryClient = useQueryClient();

  const {
    items,
    counts,
    addFiles,
    removeItem,
    retryItem,
    saveItem,
    saveAll,
    clear,
    maxFiles,
  } = useBatchUpload();

  // Al cerrar el diálogo, limpiar cola no guardada para no mezclar al reabrir.
  useEffect(() => {
    if (!open) {
      clear();
      setSavingBusy(false);
    }
  }, [open, clear]);

  const invalidateCompanyData = useCallback(
    async (
      targetCompanyId: string | null | undefined,
      authContext: AuthMutationContext,
      options: { invoices?: boolean; balances?: boolean } = {},
    ) => {
      if (!targetCompanyId) return;
      if (options.balances && isAuthMutationContextCurrent(authContext)) {
        await invalidateBalanceQueries(queryClient, targetCompanyId);
      }
      await invalidateTicketDerivedQueries(queryClient, targetCompanyId, {
        tickets: true,
        dailyReport: true,
        financialKpis: true,
        dashboardAnalytics: true,
      });
      if (options.invoices && isAuthMutationContextCurrent(authContext)) {
        await invalidateInvoiceQueries(queryClient, targetCompanyId);
      }
    },
    [queryClient],
  );

  const handleAdd = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const result = addFiles(files);
      if (result.rejected.length > 0) {
        toast.error(
          result.rejected.length === 1
            ? `${result.rejected[0].file.name}: ${result.rejected[0].reason}`
            : `Se rechazaron ${result.rejected.length} archivos.`,
        );
      }
    },
    [addFiles],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleAdd(e.dataTransfer.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleSaveAll = async () => {
    if (savingBusy || counts.analyzed === 0) {
      if (counts.analyzed === 0) toast.info('No hay tickets listos para guardar.');
      return;
    }
    const authContext = captureAuthMutationContext();
    setSavingBusy(true);
    try {
      const result = await saveAll();
      if (!isAuthMutationContextCurrent(authContext)) return;
      const matchedCompanies = new Set(result.matchedInvoiceCompanyIds);
      const balanceCompanies = new Set(result.balanceCompanyIds);
      await Promise.all(
        Array.from(new Set(result.persistedCompanyIds)).map((id) =>
          invalidateCompanyData(id, authContext, {
            invoices: matchedCompanies.has(id),
            balances: balanceCompanies.has(id),
          }),
        ),
      );
      if (!isAuthMutationContextCurrent(authContext)) return;
      if (result.ok > 0) {
        toast.success(`${result.ok} ticket(s) guardado(s).`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} ticket(s) no se pudieron guardar.`);
      }
    } finally {
      if (isAuthMutationContextCurrent(authContext)) setSavingBusy(false);
    }
  };

  const handleSaveOne = async (id: string) => {
    if (savingBusy) return;
    const authContext = captureAuthMutationContext();
    setSavingBusy(true);
    try {
      const result = await saveItem(id);
      if (!isAuthMutationContextCurrent(authContext)) return;
      if (result.persisted && result.effectsAllowed) {
        await invalidateCompanyData(result.companyId, authContext, {
          invoices: result.matchedInvoice,
          balances: result.balance,
        });
        if (!isAuthMutationContextCurrent(authContext)) return;
        toast.success(
          result.balance
            ? 'Saldo registrado.'
            : result.uiUpdated
              ? 'Ticket guardado.'
              : 'Ticket guardado en la compañía de origen.',
        );
      } else if (result.uiUpdated) {
        toast.error('No se pudo guardar el ticket.');
      }
    } finally {
      if (isAuthMutationContextCurrent(authContext)) setSavingBusy(false);
    }
  };

  const requestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    const hasUnsavedWork =
      counts.analyzed > 0 || counts.queued > 0 || counts.analyzing > 0 || counts.saving > 0;
    if (hasUnsavedWork) {
      const ok = window.confirm(
        'Hay tickets pendientes o analizados sin guardar. Si sales, se perderá ese trabajo del lote. ¿Salir de todos modos?',
      );
      if (!ok) return;
    }
    onOpenChange(false);
  };

  const slotsLeft = maxFiles - items.length;
  const allSaved = items.length > 0 && counts.saved === items.length;

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir varios tickets</DialogTitle>
          <DialogDescription>
            Hasta {maxFiles} imágenes. Se analizan en paralelo (máx. 3). Revisa el resumen y guarda
            los que confirmes. La edición detallada de productos/notas sigue en el flujo de un solo
            ticket.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            handleAdd(e.target.files);
            e.currentTarget.value = '';
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
            <Upload size={32} className="mx-auto text-muted-foreground" />
            <p className="mt-3 font-medium">Arrastra varios tickets aquí</p>
            <p className="text-sm text-muted-foreground">
              o haz clic para seleccionar (máximo {maxFiles})
            </p>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, WEBP o GIF — hasta 10 MB c/u</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                {items.length} / {maxFiles}
              </Badge>
              {counts.queued > 0 && (
                <Badge variant="outline">
                  <Clock size={12} className="mr-1" /> {counts.queued} pendientes
                </Badge>
              )}
              {counts.analyzing > 0 && (
                <Badge variant="outline" className="text-primary">
                  <Loader2 size={12} className="mr-1 animate-spin" /> {counts.analyzing} analizando
                </Badge>
              )}
              {counts.analyzed > 0 && (
                <Badge variant="outline">{counts.analyzed} listos</Badge>
              )}
              {counts.saved > 0 && (
                <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={12} className="mr-1" /> {counts.saved} guardados
                </Badge>
              )}
              {counts.error > 0 && (
                <Badge variant="outline" className="text-destructive">
                  <AlertCircle size={12} className="mr-1" /> {counts.error} con error
                </Badge>
              )}
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-border/50">
              <ul className="divide-y divide-border/50">
                {items.map((item) => (
                  <BatchListItem
                    key={item.id}
                    item={item}
                    disabled={savingBusy}
                    onSave={() => void handleSaveOne(item.id)}
                    onRemove={() => removeItem(item.id)}
                    onRetry={() => retryItem(item.id)}
                  />
                ))}
              </ul>
            </div>

            {slotsLeft > 0 && (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                disabled={savingBusy}
              >
                <Upload size={16} className="mr-2" />
                Añadir más ({slotsLeft} disponibles)
              </Button>
            )}
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => clear()}
            disabled={items.length === 0 || counts.analyzing > 0 || counts.saving > 0 || savingBusy}
            className="sm:order-1"
          >
            <Trash2 size={16} className="mr-2" /> Vaciar lista
          </Button>
          <div className="flex gap-2 sm:order-2">
            <Button variant="outline" onClick={() => requestClose(false)} disabled={savingBusy}>
              {allSaved ? 'Cerrar' : 'Salir'}
            </Button>
            <Button
              onClick={() => void handleSaveAll()}
              disabled={counts.analyzed === 0 || counts.saving > 0 || savingBusy}
            >
              {savingBusy || counts.saving > 0 ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Guardar analizados ({counts.analyzed})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchListItem({
  item,
  disabled,
  onSave,
  onRemove,
  onRetry,
}: {
  item: BatchItem;
  disabled?: boolean;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const busy = item.status === 'analyzing' || item.status === 'saving' || Boolean(disabled);

  return (
    <li className="flex items-center gap-3 p-3">
      <img
        src={item.previewUrl}
        alt={item.file.name}
        className="h-14 w-14 rounded-lg object-cover bg-muted"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
        <ItemSummary item={item} />
      </div>
      <div className="flex gap-1 shrink-0">
        {item.status === 'analyzed' && (
          <Button size="sm" onClick={onSave} disabled={busy}>
            <Save size={14} className="mr-1" /> Guardar
          </Button>
        )}
        {item.status === 'error' && (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={busy}>
            <RefreshCw size={14} className="mr-1" /> Reintentar
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={busy}
          aria-label="Quitar"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </li>
  );
}

function ItemSummary({ item }: { item: BatchItem }) {
  if (item.status === 'error') {
    return (
      <p className="text-xs text-destructive flex items-center gap-1">
        <AlertCircle size={12} /> {item.error ?? STATUS_LABEL.error}
      </p>
    );
  }

  if (item.status === 'analyzed' || item.status === 'saved') {
    const ticket = item.status === 'saved' ? item.savedTicket : item.ticket;
    return (
      <p className="text-xs text-muted-foreground">
        {STATUS_LABEL[item.status]}
        {ticket ? (
          <>
            {' '}
            — {ticket.comercio} —{' '}
            <span className="font-medium text-foreground">{formatMXN(ticket.total)}</span>
          </>
        ) : null}
      </p>
    );
  }

  if (item.status === 'analyzing' || item.status === 'saving') {
    return (
      <p className="text-xs text-primary flex items-center gap-1">
        <Loader2 size={12} className="animate-spin" /> {STATUS_LABEL[item.status]}
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1">
      <Clock size={12} /> {STATUS_LABEL[item.status]}
    </p>
  );
}
