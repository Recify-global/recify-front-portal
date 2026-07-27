import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  Camera,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Receipt,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategoryBadge } from './CategoryBadge';
import { EmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { formatMxn } from '@/utils/financial-kpis';
import { formatTicketDateTime } from '@/utils/ticket-display';
import { resolveTicketImageUrl } from '@/utils/ticket-image';
import type { HistoryTicketEditDraft } from '@/utils/ticket-edit';
import type { HistoryEditableField } from '@/hooks/use-history-table-editing';
import type {
  BackendPaymentMethod,
  BackendTicketStatus,
  BackendTicketType,
  UiTicket,
} from '@/types/ticket';

const PAYMENT_OPTIONS: { value: BackendPaymentMethod; label: string }[] = [
  { value: 'card', label: 'Tarjeta' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

const STATUS_OPTIONS: { value: BackendTicketStatus; label: string }[] = [
  { value: 'processed', label: 'Procesado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Error' },
  { value: 'duplicate', label: 'Duplicado' },
];

const TYPE_OPTIONS: { value: BackendTicketType; label: string }[] = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso', label: 'Gasto' },
];

interface HistoryTicketTableProps {
  tickets: UiTicket[];
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isSaving: boolean;
  drafts: Record<string, HistoryTicketEditDraft>;
  dirtyTicketIds: string[];
  validationErrors: Record<string, string>;
  rowErrors: Record<string, string>;
  deletingTicketId: string | null;
  editingTicketId: string | null;
  editingField: HistoryEditableField | null;
  onEditCell: (ticket: UiTicket, field: HistoryEditableField) => void;
  onUpdateDraft: (ticketId: string, patch: Partial<HistoryTicketEditDraft>) => void;
  onSave: (patch?: Partial<HistoryTicketEditDraft>) => void;
  onCancel: () => void;
  onPreviewImage: (ticket: UiTicket) => void;
  onDelete: (ticketId: string) => void;
  onClearFilters: () => void;
  onToggleAccreditable: (ticket: UiTicket, nextValue: boolean) => void;
  savingAccreditableIds: ReadonlySet<string>;
  emptyTitle?: string;
  emptyDescription?: string;
}

function columnClass(columnId: string): string {
  switch (columnId) {
    case 'comercio':
      return 'w-[16%]';
    case 'fecha':
      return 'w-[12%]';
    case 'total':
      return 'w-[11%] min-w-[8.5rem] text-right';
    case 'iva':
      return 'w-[11%] min-w-[7.5rem] text-right';
    case 'metodoPago':
      return 'w-[12%]';
    case 'tipo':
      return 'w-[9%]';
    case 'estatus':
      return 'w-[9%]';
    case 'categoria':
      return 'w-[11%]';
    case 'isAccreditable':
      return 'w-[140px] min-w-[140px] whitespace-nowrap';
    case 'actions':
      return 'w-[112px] min-w-[112px] whitespace-nowrap';
    default:
      return '';
  }
}

const editableCellClass =
  'rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer';

function EditableReadCell({
  label,
  className,
  children,
  onActivate,
  disabled,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  onActivate: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      data-history-editable-cell=""
      className={cn(editableCellClass, disabled && 'pointer-events-none opacity-60', className)}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onActivate();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onActivate();
        }
      }}
    >
      {children}
    </div>
  );
}

function CellEditorShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-history-cell-editor="" className={cn('w-full min-w-0', className)}>
      {children}
    </div>
  );
}

function isExternalEditorTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-history-cell-editor]')) return false;
  if (target.closest('[data-history-editable-cell]')) return false;
  if (
    target.closest(
      '[data-radix-select-content],[data-radix-popper-content-wrapper],[role="listbox"],[data-radix-select-viewport]',
    )
  ) {
    return false;
  }
  return true;
}

export function HistoryTicketTable({
  tickets,
  globalFilter,
  onGlobalFilterChange,
  isLoading,
  isError,
  onRetry,
  isSaving,
  drafts,
  dirtyTicketIds,
  validationErrors,
  rowErrors,
  deletingTicketId,
  editingTicketId,
  editingField,
  onEditCell,
  onUpdateDraft,
  onSave,
  onCancel,
  onPreviewImage,
  onDelete,
  onClearFilters,
  onToggleAccreditable,
  savingAccreditableIds,
  emptyTitle = 'No hay tickets para estos filtros.',
  emptyDescription = 'Prueba otro rango de fechas, categoría o búsqueda.',
}: HistoryTicketTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const dirtyIds = useMemo(() => new Set(dirtyTicketIds), [dirtyTicketIds]);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const blurCommitTimerRef = useRef<number | null>(null);
  const liveRefs = useRef({
    drafts,
    editingTicketId,
    editingField,
    isSaving,
    deletingTicketId,
    savingAccreditableIds,
    onEditCell,
    onUpdateDraft,
    onSave,
    onCancel,
    onPreviewImage,
    onDelete,
    onToggleAccreditable,
  });
  liveRefs.current = {
    drafts,
    editingTicketId,
    editingField,
    isSaving,
    deletingTicketId,
    savingAccreditableIds,
    onEditCell,
    onUpdateDraft,
    onSave,
    onCancel,
    onPreviewImage,
    onDelete,
    onToggleAccreditable,
  };

  const markProgrammaticCommit = useCallback(() => {
    suppressBlurCommitRef.current = true;
    if (blurCommitTimerRef.current !== null) {
      window.clearTimeout(blurCommitTimerRef.current);
      blurCommitTimerRef.current = null;
    }
    window.setTimeout(() => {
      suppressBlurCommitRef.current = false;
    }, 0);
  }, []);

  const commitFromUi = useCallback(
    (patch?: Partial<HistoryTicketEditDraft>) => {
      if (liveRefs.current.isSaving) return;
      markProgrammaticCommit();
      liveRefs.current.onSave(patch);
    },
    [markProgrammaticCommit],
  );

  useEffect(() => {
    if (!editingTicketId || !editingField) return;
    if (
      editingField === 'paymentMethod' ||
      editingField === 'type' ||
      editingField === 'status'
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      activeInputRef.current?.focus();
      activeInputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingField, editingTicketId]);

  useEffect(() => {
    if (!editingTicketId) return;

    const onPointerDown = (event: PointerEvent) => {
      if (liveRefs.current.isSaving) return;
      if (!isExternalEditorTarget(event.target)) return;
      markProgrammaticCommit();
      liveRefs.current.onSave();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [editingTicketId, markProgrammaticCommit]);

  useEffect(() => () => {
    if (blurCommitTimerRef.current !== null) {
      window.clearTimeout(blurCommitTimerRef.current);
    }
  }, []);

  const commitInputKeys = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitFromUi();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!liveRefs.current.isSaving) liveRefs.current.onCancel();
      }
    },
    [commitFromUi],
  );

  const commitOnBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    if (liveRefs.current.isSaving || suppressBlurCommitRef.current) return;
    const editorRoot = event.currentTarget.closest('[data-history-cell-editor]');
    if (blurCommitTimerRef.current !== null) {
      window.clearTimeout(blurCommitTimerRef.current);
    }
    blurCommitTimerRef.current = window.setTimeout(() => {
      blurCommitTimerRef.current = null;
      if (liveRefs.current.isSaving || suppressBlurCommitRef.current) return;
      const active = document.activeElement;
      if (activeInputRef.current && active === activeInputRef.current) return;
      if (editorRoot && active instanceof Node && editorRoot.contains(active)) return;
      if (active instanceof Element) {
        if (active.closest('[data-history-cell-editor]')) return;
        if (
          active.closest(
            '[data-radix-select-content],[data-radix-popper-content-wrapper],[role="listbox"]',
          )
        ) {
          return;
        }
      }
      liveRefs.current.onSave();
    }, 0);
  }, []);

  const onAmountDraftChange = useCallback((ticketId: string, raw: string) => {
    // Keep textual draft so intermediate states ("", "1.", "1.5") stay editable.
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
    liveRefs.current.onUpdateDraft(ticketId, { amount: raw });
  }, []);

  const onTaxDraftChange = useCallback((ticketId: string, raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
    liveRefs.current.onUpdateDraft(ticketId, { tax: raw });
  }, []);

  const columns = useMemo<ColumnDef<UiTicket>[]>(() => [
    {
      accessorKey: 'comercio',
      header: ({ column }) => (
        <button type="button" className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          Comercio <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onUpdateDraft: liveUpdateDraft,
          onEditCell: liveEditCell,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'vendor';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Input
                ref={activeInputRef}
                value={draft.vendor}
                maxLength={200}
                placeholder="Nombre del comercio"
                aria-label={`Editar comercio de ${row.original.comercio}`}
                disabled={liveSaving}
                className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => liveUpdateDraft(row.original.id, { vendor: event.target.value })}
                onKeyDown={commitInputKeys}
                onBlur={commitOnBlur}
              />
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar comercio de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'vendor')}
          >
            <span className="block truncate text-sm font-medium text-foreground" title={row.original.comercio}>
              {row.original.comercio}
            </span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'fecha',
      header: ({ column }) => (
        <button type="button" className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          Fecha <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onUpdateDraft: liveUpdateDraft,
          onEditCell: liveEditCell,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'date';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Input
                ref={activeInputRef}
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={draft.date}
                aria-label={`Editar fecha de ${row.original.comercio}`}
                disabled={liveSaving}
                className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => liveUpdateDraft(row.original.id, { date: event.target.value })}
                onKeyDown={commitInputKeys}
                onBlur={commitOnBlur}
              />
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar fecha de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'date')}
          >
            <span className="text-sm text-muted-foreground">
              {formatTicketDateTime(row.original.fecha)}
            </span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'total',
      header: ({ column }) => (
        <button type="button" className="flex w-full items-center justify-end gap-1" onClick={() => column.toggleSorting()}>
          Total <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onEditCell: liveEditCell,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'amount';
        if (active && draft) {
          return (
            <CellEditorShell className="min-w-[7.5rem]">
              <Input
                ref={activeInputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft.amount}
                aria-label={`Editar total de ${row.original.comercio}`}
                disabled={liveSaving}
                className="h-9 w-full min-w-[7.5rem] rounded-lg bg-background px-2 text-right text-sm tabular-nums shadow-sm"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onAmountDraftChange(row.original.id, event.target.value)}
                onKeyDown={commitInputKeys}
                onBlur={commitOnBlur}
              />
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar total de ${row.original.comercio}`}
            className="text-right"
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'amount')}
          >
            <span className="block text-right text-sm font-semibold tabular-nums text-foreground">
              {formatMxn(row.original.total)}
            </span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'iva',
      header: 'IVA',
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onEditCell: liveEditCell,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'tax';
        if (active && draft) {
          return (
            <CellEditorShell className="min-w-[7.5rem]">
              <Input
                ref={activeInputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={draft.tax}
                aria-label={`Editar IVA de ${row.original.comercio}`}
                disabled={liveSaving}
                className="h-9 w-full min-w-[7.5rem] rounded-lg bg-background px-2 text-right text-sm tabular-nums shadow-sm"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onTaxDraftChange(row.original.id, event.target.value)}
                onKeyDown={commitInputKeys}
                onBlur={commitOnBlur}
              />
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar IVA de ${row.original.comercio}`}
            className="text-right"
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'tax')}
          >
            <span className="block text-right text-sm tabular-nums text-muted-foreground">
              {formatMxn(row.original.iva)}
            </span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'metodoPago',
      header: 'Método de pago',
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onEditCell: liveEditCell,
          onCancel: liveCancel,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'paymentMethod';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Select
                value={draft.paymentMethod}
                disabled={liveSaving}
                onValueChange={(value) => {
                  commitFromUi({ paymentMethod: value as BackendPaymentMethod });
                }}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                  aria-label={`Editar método de pago de ${row.original.comercio}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!liveSaving) liveCancel();
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar método de pago de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'paymentMethod')}
          >
            <span className="text-sm text-muted-foreground">{row.original.metodoPago}</span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onEditCell: liveEditCell,
          onCancel: liveCancel,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'type';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Select
                value={draft.type}
                disabled={liveSaving}
                onValueChange={(value) => {
                  commitFromUi({ type: value as BackendTicketType });
                }}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                  aria-label={`Editar tipo de ${row.original.comercio}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!liveSaving) liveCancel();
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar tipo de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'type')}
          >
            <span className={cn(
              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
              row.original.tipo === 'Ingreso'
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive',
            )}>
              {row.original.tipo}
            </span>
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'estatus',
      header: 'Estatus',
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onEditCell: liveEditCell,
          onCancel: liveCancel,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'status';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Select
                value={draft.status}
                disabled={liveSaving}
                onValueChange={(value) => {
                  commitFromUi({ status: value as BackendTicketStatus });
                }}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                  aria-label={`Editar estatus de ${row.original.comercio}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!liveSaving) liveCancel();
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar estatus de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'status')}
          >
            <StatusBadge status={row.original.estatus} />
          </EditableReadCell>
        );
      },
    },
    {
      accessorKey: 'categoria',
      header: 'Categoría',
      cell: ({ row }) => {
        const {
          drafts: liveDrafts,
          editingTicketId: liveEditingTicketId,
          editingField: liveEditingField,
          isSaving: liveSaving,
          onUpdateDraft: liveUpdateDraft,
          onEditCell: liveEditCell,
        } = liveRefs.current;
        const draft = liveDrafts[row.original.id];
        const active = liveEditingTicketId === row.original.id && liveEditingField === 'category';
        if (active && draft) {
          return (
            <CellEditorShell>
              <Input
                ref={activeInputRef}
                value={draft.category}
                maxLength={100}
                placeholder="Categoría"
                aria-label={`Editar categoría de ${row.original.comercio}`}
                disabled={liveSaving}
                className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => liveUpdateDraft(row.original.id, { category: event.target.value })}
                onKeyDown={commitInputKeys}
                onBlur={commitOnBlur}
              />
            </CellEditorShell>
          );
        }
        return (
          <EditableReadCell
            label={`Editar categoría de ${row.original.comercio}`}
            disabled={liveSaving}
            onActivate={() => liveEditCell(row.original, 'category')}
          >
            <CategoryBadge category={row.original.categoria} />
          </EditableReadCell>
        );
      },
    },
    {
      id: 'isAccreditable',
      accessorKey: 'isAccreditable',
      header: () => (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span>Acreditable</span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Qué significa Acreditable"
                >
                  <HelpCircle size={12} aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Indica si este ticket puede utilizarse para un proceso de acreditación.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const {
          isSaving: liveSaving,
          editingTicketId: liveEditingTicketId,
          savingAccreditableIds: liveSavingAccreditableIds,
          onToggleAccreditable: liveToggleAccreditable,
        } = liveRefs.current;
        const checked = row.original.isAccreditable ?? true;
        const saving = liveSavingAccreditableIds.has(row.original.id);
        return (
          <div
            className="flex min-w-[116px] items-center gap-2 whitespace-nowrap"
            onClick={(event) => event.stopPropagation()}
          >
            <Switch
              checked={checked}
              disabled={saving || liveSaving || Boolean(liveEditingTicketId)}
              aria-label={`Marcar ticket de ${row.original.comercio} como acreditable`}
              onCheckedChange={(next) => {
                if (saving || liveSaving || liveEditingTicketId) return;
                liveToggleAccreditable(row.original, next);
              }}
            />
            <span className="text-xs text-muted-foreground">
              {checked ? 'Sí' : 'No'}
            </span>
            {saving ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const {
          isSaving: liveSaving,
          deletingTicketId: liveDeletingTicketId,
          editingTicketId: liveEditingTicketId,
          onPreviewImage: livePreviewImage,
          onDelete: liveDelete,
        } = liveRefs.current;
        const hasImage = Boolean(resolveTicketImageUrl(row.original.imagenUrl));
        return (
          <div
            className="flex min-w-[88px] items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Ver imagen del ticket de ${row.original.comercio}`}
              title={hasImage ? 'Ver imagen' : 'Sin imagen'}
              disabled={!hasImage || liveSaving}
              onClick={() => livePreviewImage(row.original)}
            >
              <Camera size={15} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={`Eliminar ticket de ${row.original.comercio}`}
              title="Eliminar ticket"
              disabled={liveSaving || liveDeletingTicketId === row.original.id || Boolean(liveEditingTicketId)}
              onClick={() => liveDelete(row.original.id)}
            >
              {liveDeletingTicketId === row.original.id
                ? <Loader2 size={15} className="animate-spin" />
                : <Trash2 size={15} />}
            </Button>
            {liveEditingTicketId === row.original.id && liveSaving ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Guardando" />
            ) : null}
          </div>
        );
      },
    },
  ], [commitFromUi, commitInputKeys, commitOnBlur, onAmountDraftChange, onTaxDraftChange]);

  const table = useReactTable({
    data: tickets,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Tickets</p>
          {editingTicketId ? (
            <p className="text-xs text-muted-foreground">
              Editando una celda. Enter o clic fuera guarda · Escape cancela.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Haz clic en una celda editable para modificarla.
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Cargando tickets...
        </div>
      ) : isError ? (
        <EmptyState
          icon={<Receipt size={32} />}
          title="No pudimos cargar los tickets"
          description="Ocurrió un error al consultar el backend. Intenta nuevamente."
          action={<Button variant="outline" className="rounded-xl" onClick={onRetry}>Reintentar</Button>}
        />
      ) : table.getRowModel().rows.length === 0 ? (
        <EmptyState
          icon={<Receipt size={32} />}
          title={emptyTitle}
          description={emptyDescription}
          action={<Button variant="outline" className="rounded-xl" onClick={onClearFilters}>Limpiar filtros</Button>}
        />
      ) : (
        <>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Tabla de tickets">
            <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border/50">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          'border-b border-border/50 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground',
                          columnClass(header.column.id),
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const rowError = validationErrors[row.original.id] ?? rowErrors[row.original.id];
                  const isDirty = dirtyIds.has(row.original.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'group transition-colors hover:bg-surface-hover',
                        isDirty && 'bg-amber-50/70 dark:bg-amber-950/20',
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            'border-b border-border/30 px-3 py-3 align-middle',
                            columnClass(cell.column.id),
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          {cell.column.id === 'comercio' && rowError ? (
                            <p className="mt-1 text-xs text-destructive" role="alert">{rowError}</p>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} ticket{table.getFilteredRowModel().rows.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                aria-label="Página anterior"
                onClick={() => table.previousPage()}
                disabled={Boolean(editingTicketId) || !table.getCanPreviousPage()}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm text-muted-foreground">
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                aria-label="Página siguiente"
                onClick={() => table.nextPage()}
                disabled={Boolean(editingTicketId) || !table.getCanNextPage()}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
