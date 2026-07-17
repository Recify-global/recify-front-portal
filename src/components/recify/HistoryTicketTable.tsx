import { useMemo, useState } from 'react';
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
  Edit3,
  HelpCircle,
  Loader2,
  Receipt,
  Save,
  Trash2,
  X,
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
  isEditing: boolean;
  isSaving: boolean;
  drafts: Record<string, HistoryTicketEditDraft>;
  dirtyTicketIds: string[];
  validationErrors: Record<string, string>;
  rowErrors: Record<string, string>;
  deletingTicketId: string | null;
  onStartEditing: (ticketIds: string[]) => void;
  onUpdateDraft: (ticketId: string, patch: Partial<HistoryTicketEditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreviewImage: (ticket: UiTicket) => void;
  onDelete: (ticketId: string) => void;
  onClearFilters: () => void;
  onToggleAccreditable: (ticket: UiTicket, nextValue: boolean) => void;
  savingAccreditableIds: ReadonlySet<string>;
}

function columnClass(columnId: string): string {
  switch (columnId) {
    case 'comercio':
      return 'w-[16%]';
    case 'fecha':
      return 'w-[12%]';
    case 'total':
      return 'w-[9%] text-right';
    case 'iva':
      return 'w-[8%] text-right';
    case 'metodoPago':
      return 'w-[12%]';
    case 'tipo':
      return 'w-[9%]';
    case 'estatus':
      return 'w-[9%]';
    case 'categoria':
      return 'w-[11%]';
    case 'isAccreditable':
      return 'w-[9%]';
    case 'actions':
      return 'w-[10%]';
    default:
      return '';
  }
}

export function HistoryTicketTable({
  tickets,
  globalFilter,
  onGlobalFilterChange,
  isLoading,
  isError,
  onRetry,
  isEditing,
  isSaving,
  drafts,
  dirtyTicketIds,
  validationErrors,
  rowErrors,
  deletingTicketId,
  onStartEditing,
  onUpdateDraft,
  onSave,
  onCancel,
  onPreviewImage,
  onDelete,
  onClearFilters,
  onToggleAccreditable,
  savingAccreditableIds,
}: HistoryTicketTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const dirtyIds = useMemo(() => new Set(dirtyTicketIds), [dirtyTicketIds]);

  const columns = useMemo<ColumnDef<UiTicket>[]>(() => [
    {
      accessorKey: 'comercio',
      header: ({ column }) => (
        <button type="button" className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          Comercio <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ row }) => {
        const draft = drafts[row.original.id];
        return isEditing && draft ? (
          <Input
            value={draft.vendor}
            maxLength={200}
            placeholder="Nombre del comercio"
            aria-label={`Comercio de ${row.original.comercio}`}
            className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
            onChange={(event) => onUpdateDraft(row.original.id, { vendor: event.target.value })}
          />
        ) : (
          <span
            className="block truncate text-sm font-medium text-foreground"
            title={row.original.comercio}
          >
            {row.original.comercio}
          </span>
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
        const draft = drafts[row.original.id];
        if (!isEditing || !draft) {
          return <span className="text-sm text-muted-foreground">{formatTicketDateTime(row.original.fecha)}</span>;
        }
        return (
          <Input
            type="date"
            value={draft.date}
            aria-label={`Fecha de ${row.original.comercio}`}
            className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
            onChange={(event) => onUpdateDraft(row.original.id, { date: event.target.value })}
          />
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
        const draft = drafts[row.original.id];
        return isEditing && draft ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={draft.amount}
            aria-label={`Total de ${row.original.comercio}`}
            className="h-9 w-full rounded-lg bg-background text-right text-sm tabular-nums shadow-sm"
            onChange={(event) => onUpdateDraft(row.original.id, { amount: event.target.value })}
          />
        ) : (
          <span className="block text-right text-sm font-semibold tabular-nums text-foreground">{formatMxn(row.original.total)}</span>
        );
      },
    },
    {
      accessorKey: 'iva',
      header: 'IVA',
      cell: ({ row }) => <span className="block text-right text-sm tabular-nums text-muted-foreground">{formatMxn(row.original.iva)}</span>,
    },
    {
      accessorKey: 'metodoPago',
      header: 'Método de pago',
      cell: ({ row }) => {
        const draft = drafts[row.original.id];
        return isEditing && draft ? (
          <Select
            value={draft.paymentMethod}
            onValueChange={(value) => onUpdateDraft(row.original.id, { paymentMethod: value as BackendPaymentMethod })}
          >
            <SelectTrigger
              className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
              aria-label={`Método de pago de ${row.original.comercio}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">{row.original.metodoPago}</span>
        );
      },
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => {
        const draft = drafts[row.original.id];
        if (isEditing && draft) {
          return (
            <Select
              value={draft.type}
              onValueChange={(value) => onUpdateDraft(row.original.id, { type: value as BackendTicketType })}
            >
              <SelectTrigger
                className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
                aria-label={`Tipo de ${row.original.comercio}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <span className={cn(
            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
            row.original.tipo === 'Ingreso'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive',
          )}>
            {row.original.tipo}
          </span>
        );
      },
    },
    {
      accessorKey: 'estatus',
      header: 'Estatus',
      cell: ({ row }) => {
        const draft = drafts[row.original.id];
        return isEditing && draft ? (
          <Select
            value={draft.status}
            onValueChange={(value) => onUpdateDraft(row.original.id, { status: value as BackendTicketStatus })}
          >
            <SelectTrigger
              className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
              aria-label={`Estatus de ${row.original.comercio}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge status={row.original.estatus} />
        );
      },
    },
    {
      accessorKey: 'categoria',
      header: 'Categoría',
      cell: ({ row }) => {
        const draft = drafts[row.original.id];
        return isEditing && draft ? (
          <Input
            value={draft.category}
            maxLength={100}
            placeholder="Categoría"
            aria-label={`Categoría de ${row.original.comercio}`}
            className="h-9 w-full rounded-lg bg-background text-sm shadow-sm"
            onChange={(event) => onUpdateDraft(row.original.id, { category: event.target.value })}
          />
        ) : (
          <CategoryBadge category={row.original.categoria} />
        );
      },
    },
    {
      id: 'isAccreditable',
      accessorKey: 'isAccreditable',
      header: () => (
        <div className="flex items-center gap-1">
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
        const checked = row.original.isAccreditable ?? false;
        const saving = savingAccreditableIds.has(row.original.id);
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={checked}
              disabled={saving || isEditing}
              aria-label={`Marcar ticket de ${row.original.comercio} como acreditable`}
              onCheckedChange={(next) => {
                if (saving || isEditing) return;
                onToggleAccreditable(row.original, next);
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
        const hasImage = Boolean(resolveTicketImageUrl(row.original.imagenUrl));
        return (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Ver imagen del ticket de ${row.original.comercio}`}
            title={hasImage ? 'Ver imagen' : 'Sin imagen'}
            disabled={!hasImage}
            onClick={() => onPreviewImage(row.original)}
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
            disabled={isEditing || deletingTicketId === row.original.id}
            onClick={() => onDelete(row.original.id)}
          >
            {deletingTicketId === row.original.id
              ? <Loader2 size={15} className="animate-spin" />
              : <Trash2 size={15} />}
          </Button>
        </div>
        );
      },
    },
  ], [
    savingAccreditableIds,
    deletingTicketId,
    drafts,
    isEditing,
    onDelete,
    onPreviewImage,
    onToggleAccreditable,
    onUpdateDraft,
  ]);

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

  const visibleTicketIds = table.getRowModel().rows.map((row) => row.original.id);
  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Tickets</p>
          {isEditing ? (
            <p className="text-xs text-muted-foreground">
              {dirtyTicketIds.length} fila{dirtyTicketIds.length === 1 ? '' : 's'} modificada{dirtyTicketIds.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        {isEditing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              disabled={isSaving || dirtyTicketIds.length === 0 || hasValidationErrors}
              onClick={onSave}
            >
              {isSaving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={isSaving}
              onClick={onCancel}
            >
              <X size={14} className="mr-2" /> Cancelar
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={visibleTicketIds.length === 0}
            onClick={() => onStartEditing(visibleTicketIds)}
          >
            <Edit3 size={14} className="mr-2" /> Editar tabla
          </Button>
        )}
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
          title="No hay tickets para estos filtros."
          description="Prueba otro rango de fechas, categoría o búsqueda."
          action={<Button variant="outline" className="rounded-xl" onClick={onClearFilters}>Limpiar filtros</Button>}
        />
      ) : (
        <>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Tabla de tickets">
            <table className="w-full min-w-[880px] table-fixed border-separate border-spacing-0">
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
                          className="border-b border-border/30 px-3 py-3 align-middle"
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
                disabled={isEditing || !table.getCanPreviousPage()}
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
                disabled={isEditing || !table.getCanNextPage()}
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
