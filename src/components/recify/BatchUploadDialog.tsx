import { useCallback, useRef, useState } from 'react';
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
import { useBatchUpload, type BatchItem, type BatchItemStatus } from '@/hooks/use-batch-upload';
import { cn } from '@/lib/utils';

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Disparado cuando se guardan tickets, para invalidar caches en el padre. */
  onSaved?: () => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function BatchUploadDialog({ open, onOpenChange, onSaved }: BatchUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const {
    items,
    counts,
    addFiles,
    removeItem,
    retryItem,
    saveItem,
    saveAllAnalyzed,
    clear,
    maxFiles,
  } = useBatchUpload();

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
    if (counts.analyzed === 0) {
      toast.info('No hay tickets analizados pendientes de guardar.');
      return;
    }
    const result = await saveAllAnalyzed();
    if (result.ok > 0) {
      toast.success(`${result.ok} ticket(s) guardado(s).`);
      onSaved?.();
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} ticket(s) fallaron al guardar.`);
    }
  };

  const handleSaveOne = async (id: string) => {
    const ok = await saveItem(id);
    if (ok) {
      toast.success('Ticket guardado.');
      onSaved?.();
    } else {
      toast.error('No se pudo guardar el ticket.');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const slotsLeft = maxFiles - items.length;
  const processing = counts.analyzing + counts.queued + counts.saving;
  const allSaved = items.length > 0 && counts.saved === items.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir varios tickets</DialogTitle>
          <DialogDescription>
            Suelta hasta {maxFiles} imágenes. Se analizarán en paralelo (3 a la vez). Revisa cada
            resultado y guarda los que confirmes.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
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
            {/* Status header */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{items.length} / {maxFiles}</Badge>
              {counts.queued > 0 && (
                <Badge variant="outline">
                  <Clock size={12} className="mr-1" /> {counts.queued} en cola
                </Badge>
              )}
              {counts.analyzing > 0 && (
                <Badge variant="outline" className="text-primary">
                  <Loader2 size={12} className="mr-1 animate-spin" /> {counts.analyzing} analizando
                </Badge>
              )}
              {counts.analyzed > 0 && (
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                  {counts.analyzed} listos para guardar
                </Badge>
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

            {/* Lista de ítems */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-border/50">
              <ul className="divide-y divide-border/50">
                {items.map((item) => (
                  <BatchListItem
                    key={item.id}
                    item={item}
                    onSave={() => handleSaveOne(item.id)}
                    onRemove={() => removeItem(item.id)}
                    onRetry={() => retryItem(item.id)}
                  />
                ))}
              </ul>
            </div>

            {/* Añadir más si hay slots */}
            {slotsLeft > 0 && (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
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
            onClick={() => {
              clear();
            }}
            disabled={items.length === 0 || processing > 0}
            className="sm:order-1"
          >
            <Trash2 size={16} className="mr-2" /> Vaciar lista
          </Button>
          <div className="flex gap-2 sm:order-2">
            <Button variant="outline" onClick={handleClose}>
              {allSaved ? 'Cerrar' : 'Salir sin guardar todo'}
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={counts.analyzed === 0 || counts.saving > 0}
            >
              {counts.saving > 0 ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Guardar todos los analizados ({counts.analyzed})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BatchListItemProps {
  item: BatchItem;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
}

function BatchListItem({ item, onSave, onRemove, onRetry }: BatchListItemProps) {
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
      <ItemActions item={item} onSave={onSave} onRemove={onRemove} onRetry={onRetry} />
    </li>
  );
}

function ItemSummary({ item }: { item: BatchItem }) {
  switch (item.status) {
    case 'queued':
      return (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock size={12} /> En cola
        </p>
      );
    case 'analyzing':
      return (
        <p className="text-xs text-primary flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Analizando con IA…
        </p>
      );
    case 'analyzed':
      return (
        <p className="text-xs text-muted-foreground">
          {item.ticket?.comercio ?? 'Sin comercio'} —{' '}
          <span className="font-medium text-foreground">
            ${item.ticket?.total?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) ?? '0.00'}
          </span>
        </p>
      );
    case 'saving':
      return (
        <p className="text-xs text-primary flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Guardando…
        </p>
      );
    case 'saved':
      return (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={12} /> Guardado en el histórico
        </p>
      );
    case 'error':
      return (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle size={12} /> {item.error ?? 'Error desconocido'}
        </p>
      );
  }
}

function ItemActions({
  item,
  onSave,
  onRemove,
  onRetry,
}: {
  item: BatchItem;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const busy: BatchItemStatus[] = ['analyzing', 'saving'];
  const isBusy = busy.includes(item.status);

  if (item.status === 'saved') {
    return (
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Quitar de la lista">
        <Trash2 size={16} />
      </Button>
    );
  }

  if (item.status === 'error') {
    return (
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw size={14} className="mr-1" /> Reintentar
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Quitar">
          <Trash2 size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {item.status === 'analyzed' && (
        <Button size="sm" onClick={onSave}>
          <Save size={14} className="mr-1" /> Guardar
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={isBusy}
        aria-label="Quitar"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
}
