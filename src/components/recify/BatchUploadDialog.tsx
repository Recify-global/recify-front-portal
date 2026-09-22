import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { TICKET_IMAGE_ACCEPT } from '@/utils/upload-file';
import { EditableField } from '@/components/recify/EditableField';
import {
  getBatchTicketDraftValidationMessage,
  hasBatchTicketDraftChanges,
  type BatchTicketDraft,
} from '@/utils/ticket-edit';
import { formatCivilDateDisplay } from '@/utils/civil-date-input';
import { formatMxn } from '@/utils/financial-kpis';
import type { BackendPaymentMethod, BackendTicketType } from '@/types/ticket';

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  queued: 'Pendiente',
  analyzing: 'Analizando',
  analyzed: 'Listo para guardar',
  saving: 'Guardando',
  saved: 'Guardado',
  error: 'Error',
};

const PAYMENT_OPTIONS: { value: BackendPaymentMethod; label: string }[] = [
  { value: 'card', label: 'Tarjeta' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

const TYPE_OPTIONS: { value: BackendTicketType; label: string }[] = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso', label: 'Gasto' },
];

type BatchEditableField = keyof Pick<
  BatchTicketDraft,
  'vendor' | 'date' | 'amount' | 'tax' | 'paymentMethod' | 'type' | 'category'
>;

export function BatchUploadDialog({ open, onOpenChange }: BatchUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [savingBusy, setSavingBusy] = useState(false);
  const queryClient = useQueryClient();

  const {
    items,
    counts,
    readyCount,
    addFiles,
    removeItem,
    retryItem,
    saveItem,
    saveAll,
    updateItemDraft,
    clear,
    maxFiles,
  } = useBatchUpload();

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
    if (savingBusy || readyCount === 0) {
      if (readyCount === 0) toast.info('No hay tickets listos para guardar.');
      return;
    }
    const invalid = items.find(
      (item) =>
        item.draft &&
        (item.status === 'analyzed' || item.failedStage === 'save') &&
        getBatchTicketDraftValidationMessage(item.draft),
    );
    if (invalid?.draft) {
      toast.error(getBatchTicketDraftValidationMessage(invalid.draft));
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
    const item = items.find((it) => it.id === id);
    if (item?.draft) {
      const message = getBatchTicketDraftValidationMessage(item.draft);
      if (message) {
        toast.error(message);
        return;
      }
    }
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
            Hasta {maxFiles} imágenes. Revisa cada ticket, corrige los campos y guarda. La
            confirmación crea el ticket con tus cambios; no edita tickets ya existentes.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept={TICKET_IMAGE_ACCEPT}
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
              <Accordion type="multiple" className="w-full">
                {items.map((item, index) => (
                  <BatchAccordionItem
                    key={item.id}
                    index={index}
                    item={item}
                    disabled={savingBusy}
                    onSave={() => void handleSaveOne(item.id)}
                    onRemove={() => removeItem(item.id)}
                    onRetry={() => retryItem(item.id)}
                    onUpdateDraft={(patch) => updateItemDraft(item.id, patch)}
                  />
                ))}
              </Accordion>
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
              disabled={readyCount === 0 || counts.saving > 0 || savingBusy}
            >
              {savingBusy || counts.saving > 0 ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              Guardar tickets ({readyCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BatchAccordionItem({
  index,
  item,
  disabled,
  onSave,
  onRemove,
  onRetry,
  onUpdateDraft,
}: {
  index: number;
  item: BatchItem;
  disabled?: boolean;
  onSave: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onUpdateDraft: (patch: Partial<BatchTicketDraft>) => void;
}) {
  const busy = item.status === 'analyzing' || item.status === 'saving' || Boolean(disabled);
  const canEdit =
    Boolean(item.draft) &&
    (item.status === 'analyzed' || (item.status === 'error' && item.failedStage === 'save'));
  const dirty = hasBatchTicketDraftChanges(item.baseline, item.draft);
  const validation = getBatchTicketDraftValidationMessage(item.draft);

  return (
    <AccordionItem value={item.id} className="border-b border-border/50 px-3">
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1 py-3 hover:no-underline text-left">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={item.previewUrl}
              alt=""
              className="h-12 w-12 rounded-lg object-cover bg-muted"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                Ticket {index + 1}
                {item.ticket?.comercio ? ` · ${item.ticket.comercio}` : ''}
              </p>
              <ItemSummary item={item} />
            </div>
            {dirty ? (
              <Badge variant="outline" className="shrink-0">
                Modificado
              </Badge>
            ) : null}
          </div>
        </AccordionTrigger>
        <div className="flex gap-1 shrink-0 pr-1">
          {(item.status === 'analyzed' ||
            (item.status === 'error' && item.failedStage === 'save')) && (
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onSave();
              }}
              disabled={busy || Boolean(validation)}
            >
              <Save size={14} className="mr-1" /> Guardar
            </Button>
          )}
          {item.status === 'error' && (
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onRetry();
              }}
              disabled={busy}
            >
              <RefreshCw size={14} className="mr-1" /> Reintentar
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            disabled={busy}
            aria-label="Quitar"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <AccordionContent>
        {item.preview?.documentKind === 'balance' ? (
          <p className="text-sm text-muted-foreground">
            Captura de saldo. Se registrará como saldo, no como ticket.
          </p>
        ) : canEdit && item.draft ? (
          <BatchDraftFields
            item={item}
            draft={item.draft}
            disabled={busy}
            validation={validation}
            onUpdateDraft={onUpdateDraft}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{STATUS_LABEL[item.status]}</p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function BatchDraftFields({
  item,
  draft,
  disabled,
  validation,
  onUpdateDraft,
}: {
  item: BatchItem;
  draft: BatchTicketDraft;
  disabled: boolean;
  validation: string | null;
  onUpdateDraft: (patch: Partial<BatchTicketDraft>) => void;
}) {
  const [editingField, setEditingField] = useState<BatchEditableField | null>(null);
  const vendorLabel = draft.vendor.trim() || item.ticket?.comercio || 'este ticket';

  const endEdit = () => setEditingField(null);

  return (
    <div className="space-y-3 pb-2">
      {validation ? <p className="text-xs text-destructive">{validation}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DraftField
          label={`Editar comercio de ${vendorLabel}`}
          caption="Comercio"
          editing={editingField === 'vendor'}
          disabled={disabled}
          onStartEdit={() => setEditingField('vendor')}
          editor={
            <Input
              value={draft.vendor}
              maxLength={200}
              aria-label={`Editar comercio de ${vendorLabel}`}
              className="h-9 rounded-lg text-sm"
              onChange={(event) => onUpdateDraft({ vendor: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  endEdit();
                }
              }}
              onBlur={endEdit}
            />
          }
        >
          <span className="text-sm font-medium">{draft.vendor || 'Sin comercio'}</span>
        </DraftField>

        <DraftField
          label={`Editar fecha de ${vendorLabel}`}
          caption="Fecha"
          editing={editingField === 'date'}
          disabled={disabled}
          onStartEdit={() => setEditingField('date')}
          editor={
            <Input
              type="date"
              value={draft.date}
              aria-label={`Editar fecha de ${vendorLabel}`}
              className="h-9 rounded-lg text-sm"
              onChange={(event) => onUpdateDraft({ date: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  endEdit();
                }
              }}
              onBlur={endEdit}
            />
          }
        >
          <span className="text-sm">{formatCivilDateDisplay(draft.date) || 'Sin fecha'}</span>
        </DraftField>

        <DraftField
          label={`Editar total de ${vendorLabel}`}
          caption="Total"
          editing={editingField === 'amount'}
          disabled={disabled}
          onStartEdit={() => setEditingField('amount')}
          editor={
            <Input
              inputMode="decimal"
              value={draft.amount}
              aria-label={`Editar total de ${vendorLabel}`}
              className="h-9 rounded-lg text-sm"
              onChange={(event) => {
                const raw = event.target.value;
                if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                onUpdateDraft({ amount: raw });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  endEdit();
                }
              }}
              onBlur={endEdit}
            />
          }
        >
          <span className="text-sm font-semibold tabular-nums">
            {formatMxn(Number(draft.amount) || 0)}
          </span>
        </DraftField>

        <DraftField
          label={`Editar IVA de ${vendorLabel}`}
          caption="IVA"
          editing={editingField === 'tax'}
          disabled={disabled}
          onStartEdit={() => setEditingField('tax')}
          editor={
            <Input
              inputMode="decimal"
              value={draft.tax}
              aria-label={`Editar IVA de ${vendorLabel}`}
              className="h-9 rounded-lg text-sm"
              onChange={(event) => {
                const raw = event.target.value;
                if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                onUpdateDraft({ tax: raw });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  endEdit();
                }
              }}
              onBlur={endEdit}
            />
          }
        >
          <span className="text-sm tabular-nums">
            {draft.tax === '' ? 'Sin IVA' : formatMxn(Number(draft.tax) || 0)}
          </span>
        </DraftField>

        <DraftField
          label={`Editar método de pago de ${vendorLabel}`}
          caption="Método de pago"
          editing={editingField === 'paymentMethod'}
          disabled={disabled}
          onStartEdit={() => setEditingField('paymentMethod')}
          editor={
            <Select
              value={draft.paymentMethod}
              onValueChange={(value) => {
                onUpdateDraft({ paymentMethod: value as BackendPaymentMethod });
                endEdit();
              }}
            >
              <SelectTrigger
                className="h-9 rounded-lg text-sm"
                aria-label={`Editar método de pago de ${vendorLabel}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          <span className="text-sm">
            {PAYMENT_OPTIONS.find((option) => option.value === draft.paymentMethod)?.label}
          </span>
        </DraftField>

        <DraftField
          label={`Editar tipo de ${vendorLabel}`}
          caption="Tipo"
          editing={editingField === 'type'}
          disabled={disabled}
          onStartEdit={() => setEditingField('type')}
          editor={
            <Select
              value={draft.type}
              onValueChange={(value) => {
                onUpdateDraft({ type: value as BackendTicketType });
                endEdit();
              }}
            >
              <SelectTrigger
                className="h-9 rounded-lg text-sm"
                aria-label={`Editar tipo de ${vendorLabel}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          <span className="text-sm">
            {TYPE_OPTIONS.find((option) => option.value === draft.type)?.label}
          </span>
        </DraftField>

        <DraftField
          label={`Editar categoría de ${vendorLabel}`}
          caption="Categoría"
          editing={editingField === 'category'}
          disabled={disabled}
          onStartEdit={() => setEditingField('category')}
          editor={
            <Input
              value={draft.category}
              maxLength={100}
              aria-label={`Editar categoría de ${vendorLabel}`}
              className="h-9 rounded-lg text-sm"
              onChange={(event) => onUpdateDraft({ category: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault();
                  endEdit();
                }
              }}
              onBlur={endEdit}
            />
          }
        >
          <span className="text-sm">{draft.category || 'Sin categoría'}</span>
        </DraftField>
      </div>
    </div>
  );
}

function DraftField({
  label,
  caption,
  editing,
  disabled,
  onStartEdit,
  editor,
  children,
}: {
  label: string;
  caption: string;
  editing: boolean;
  disabled: boolean;
  onStartEdit: () => void;
  editor: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{caption}</Label>
      {editing && !disabled ? (
        editor
      ) : (
        <EditableField label={label} disabled={disabled} onStartEdit={onStartEdit}>
          {children}
        </EditableField>
      )}
    </div>
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
    const dateLabel = ticket?.fecha ? formatCivilDateDisplay(ticket.fecha) : null;
    return (
      <p className="truncate text-xs text-muted-foreground">
        {STATUS_LABEL[item.status]}
        {ticket ? (
          <>
            {' '}
            — {ticket.comercio} — {formatMxn(ticket.total)}
            {dateLabel ? ` · ${dateLabel}` : ''}
          </>
        ) : item.preview?.documentKind === 'balance' ? (
          ' — Captura de saldo'
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
