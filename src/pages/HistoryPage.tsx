import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { MetricCard } from '@/components/recify/MetricCard';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import { TicketNotes } from '@/components/recify/TicketNotes';
import { EmptyState } from '@/components/recify/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Receipt, DollarSign, Tags, AlertCircle, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, Trash2, Edit3, X, Loader2, Save, XCircle,
} from 'lucide-react';
import { ApiRequestError } from '@/api/http';
import { mapBackendTicket, mapBackendTickets } from '@/mappers/ticket.mapper';
import { useTicket, useTickets, useUpdateDashboardTicket } from '@/hooks/use-tickets';
import { useAuth } from '@/hooks/use-auth';
import { deleteTicket } from '@/services/tickets.service';
import {
  buildTicketUpdatePayload,
  createDraftFromTicket,
  getTicketEditValidationMessage,
  hasTicketEditChanges,
  normalizeTicketEditDraft,
  type TicketEditDraft,
} from '@/utils/ticket-edit';
import type {
  BackendPaymentMethod,
  BackendTicketReviewStatus,
  BackendTicketStatus,
  BackendTicketType,
  UiTicket,
} from '@/types/ticket';

const formatMXN = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const statusOptions = ['analizado', 'pendiente', 'error'] as const;

const columns: ColumnDef<UiTicket>[] = [
  {
    accessorKey: 'comercio',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting()}
      >
        Comercio <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="font-medium text-foreground text-sm">{row.getValue('comercio')}</span>
    ),
  },
  {
    accessorKey: 'fecha',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting()}
      >
        Fecha <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.getValue('fecha')}</span>
    ),
  },
  {
    accessorKey: 'categoria',
    header: 'Categoría',
    cell: ({ row }) => <CategoryBadge category={row.getValue('categoria')} />,
    filterFn: 'equals',
  },
  {
    accessorKey: 'metodoPago',
    header: 'Método',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.getValue('metodoPago')}</span>
    ),
  },
  {
    accessorKey: 'total',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting()}
      >
        Total <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="font-semibold text-foreground text-sm">
        {formatMXN(row.getValue('total'))}
      </span>
    ),
  },
  {
    accessorKey: 'estatus',
    header: 'Estatus',
    cell: ({ row }) => <StatusBadge status={row.getValue('estatus')} />,
    filterFn: 'equals',
  },
];

const PAYMENT_OPTIONS: { value: BackendPaymentMethod; label: string }[] = [
  { value: 'card', label: 'Tarjeta' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

const BACKEND_STATUS_OPTIONS: { value: BackendTicketStatus; label: string }[] = [
  { value: 'processed', label: 'Analizado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'failed', label: 'Error' },
  { value: 'duplicate', label: 'Duplicado' },
];

const REVIEW_STATUS_OPTIONS: { value: BackendTicketReviewStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente de revisión' },
  { value: 'revisado', label: 'Revisado' },
];

const TYPE_OPTIONS: { value: BackendTicketType; label: string }[] = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso', label: 'Gasto' },
];

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/** Normaliza `UiTicket.fecha` (YYYY-MM-DD) para comparar por día completo. */
function ticketDateKey(fecha: string | undefined | null): string | null {
  if (!fecha || typeof fecha !== 'string') return null;
  const trimmed = fecha.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function clearHistoryFilters(
  setGlobalFilter: (v: string) => void,
  setCategoryFilter: (v: string) => void,
  setStatusFilter: (v: string) => void,
  setDateFromFilter: (v: string) => void,
  setDateToFilter: (v: string) => void,
) {
  setGlobalFilter('');
  setCategoryFilter('all');
  setStatusFilter('all');
  setDateFromFilter('');
  setDateToFilter('');
}

export default function HistoryPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<UiTicket | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [lastKnownImageUrl, setLastKnownImageUrl] = useState<string | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<TicketEditDraft | null>(null);
  const [draft, setDraft] = useState<TicketEditDraft | null>(null);

  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  const ticketsQuery = useTickets({ page: 1, limit: 100 });
  const detailQuery = useTicket(selectedTicket?.id);
  const updateMutation = useUpdateDashboardTicket();
  const backendTicket = detailQuery.data;
  const editing = draft !== null;
  const canEdit = Boolean(backendTicket) && !detailQuery.isLoading;

  const tickets = useMemo(
    () => mapBackendTickets(ticketsQuery.data?.data),
    [ticketsQuery.data?.data],
  );

  const categorias = useMemo(() => {
    const values = Array.from(new Set(tickets.map((t) => t.categoria))).filter(Boolean);
    return values.sort((a, b) => a.localeCompare(b, 'es-MX'));
  }, [tickets]);

  const filteredData = useMemo(() => {
    let data = [...tickets];
    if (categoryFilter !== 'all') data = data.filter((t) => t.categoria === categoryFilter);
    if (statusFilter !== 'all') data = data.filter((t) => t.estatus === statusFilter);

    const fromKey = dateFromFilter.trim() || null;
    const toKey = dateToFilter.trim() || null;
    if (fromKey || toKey) {
      data = data.filter((t) => {
        const key = ticketDateKey(t.fecha);
        if (!key) return false;
        if (fromKey && key < fromKey) return false;
        if (toKey && key > toKey) return false;
        return true;
      });
    }

    return data;
  }, [tickets, categoryFilter, statusFilter, dateFromFilter, dateToFilter]);

  const handleClearFilters = () => {
    clearHistoryFilters(
      setGlobalFilter,
      setCategoryFilter,
      setStatusFilter,
      setDateFromFilter,
      setDateToFilter,
    );
  };

  const selectedTicketDetail = useMemo(() => {
    if (detailQuery.data) {
      const mapped = mapBackendTicket(detailQuery.data);
      return {
        ...mapped,
        imagenUrl: mapped.imagenUrl ?? lastKnownImageUrl ?? selectedTicket?.imagenUrl,
      };
    }
    if (!selectedTicket) return null;
    return {
      ...selectedTicket,
      imagenUrl: selectedTicket.imagenUrl ?? lastKnownImageUrl ?? undefined,
    };
  }, [detailQuery.data, lastKnownImageUrl, selectedTicket]);

  const editValidationMessage = useMemo(() => getTicketEditValidationMessage(draft), [draft]);
  const hasEditChanges = useMemo(
    () => hasTicketEditChanges(baselineDraft, draft),
    [baselineDraft, draft],
  );
  const canSaveEdit = Boolean(draft && baselineDraft && hasEditChanges && !editValidationMessage);
  const editReadonlyFields = useMemo(
    () =>
      selectedTicketDetail
        ? [
            { label: 'Comercio', value: selectedTicketDetail.comercio },
            ...(selectedTicketDetail.folio ? [{ label: 'Folio', value: selectedTicketDetail.folio }] : []),
            { label: 'Hora', value: selectedTicketDetail.hora },
            { label: 'Subtotal', value: formatMXN(selectedTicketDetail.subtotal) },
            { label: 'IVA', value: formatMXN(selectedTicketDetail.iva) },
            { label: 'Moneda', value: selectedTicketDetail.moneda },
          ]
        : [],
    [selectedTicketDetail],
  );

  useEffect(() => {
    if (selectedTicketDetail?.imagenUrl) {
      setLastKnownImageUrl(selectedTicketDetail.imagenUrl);
    }
  }, [selectedTicketDetail?.imagenUrl]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      if (!companyId) throw new Error('No hay compañía activa.');
      await deleteTicket(companyId, ticketId);
    },
    onSuccess: async () => {
      toast.success('Ticket eliminado.');
      setSelectedTicket(null);
      await queryClient.invalidateQueries({ queryKey: ['tickets', companyId] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el ticket.';
      toast.error(message);
    },
  });

  const handleOpenSheet = (ticket: UiTicket) => {
    setSelectedTicket(ticket);
    setLastKnownImageUrl(ticket.imagenUrl ?? null);
    setBaselineDraft(null);
    setDraft(null);
  };

  const handleCloseSheet = () => {
    setSelectedTicket(null);
    setLastKnownImageUrl(null);
    setBaselineDraft(null);
    setDraft(null);
  };

  const handleStartEdit = () => {
    if (!backendTicket) return;
    const nextDraft = createDraftFromTicket(backendTicket);
    setBaselineDraft(nextDraft);
    setDraft(nextDraft);
  };

  const handleCancelEdit = () => {
    setBaselineDraft(null);
    setDraft(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedTicketDetail?.id || !baselineDraft || !draft || updateMutation.isPending) return;

    const result = buildTicketUpdatePayload(baselineDraft, draft);
    if (!result.ok) {
      if (result.reason === 'no-changes') {
        toast.info('No hay cambios para guardar.');
        return;
      }
      toast.error(result.message);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        ticketId: selectedTicketDetail.id,
        payload: result.payload,
      });
      const normalizedDraft = normalizeTicketEditDraft(draft);
      setBaselineDraft(normalizedDraft);
      setDraft(null);
      toast.success('Cambios guardados.');
    } catch (err) {
      toast.error(extractMessage(err, 'No se pudieron guardar los cambios.'));
    }
  };

  const updateDraft = <K extends keyof TicketEditDraft>(key: K, value: TicketEditDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleDelete = () => {
    if (!selectedTicketDetail?.id || deleteMutation.isPending) return;
    deleteMutation.mutate(selectedTicketDetail.id);
  };

  const totalGasto = filteredData.reduce((acc, t) => acc + t.total, 0);
  const uniqueCategories = new Set(filteredData.map((t) => t.categoria)).size;
  const pendientes = filteredData.filter((t) => t.estatus === 'pendiente').length;
  const subtitle = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date());
  const capitalizedSubtitle = subtitle.charAt(0).toUpperCase() + subtitle.slice(1);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de tickets</h1>
          <p className="text-muted-foreground mt-1">Todos tus comprobantes organizados y clasificados</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Tickets este mes" value={filteredData.length} subtitle={capitalizedSubtitle} icon={<Receipt size={20} />} />
          <MetricCard title="Gasto total" value={formatMXN(totalGasto)} subtitle={capitalizedSubtitle} icon={<DollarSign size={20} />} />
          <MetricCard title="Categorías" value={uniqueCategories} subtitle="detectadas" icon={<Tags size={20} />} />
          <MetricCard title="Pendientes" value={pendientes} subtitle="por revisar" icon={<AlertCircle size={20} />} />
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por comercio, categoría..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
                />
                {globalFilter && (
                  <button type="button" onClick={() => setGlobalFilter('')}>
                    <X size={14} className="text-muted-foreground" />
                  </button>
                )}
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl border-border">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36 h-10 rounded-xl border-border">
                  <SelectValue placeholder="Estatus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-1.5 w-full sm:w-40">
                <Label htmlFor="history-date-from" className="text-xs text-muted-foreground">
                  Desde
                </Label>
                <Input
                  id="history-date-from"
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  className="h-10 rounded-xl border-border"
                />
              </div>
              <div className="space-y-1.5 w-full sm:w-40">
                <Label htmlFor="history-date-to" className="text-xs text-muted-foreground">
                  Hasta
                </Label>
                <Input
                  id="history-date-to"
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  className="h-10 rounded-xl border-border"
                />
              </div>
              {(globalFilter ||
                categoryFilter !== 'all' ||
                statusFilter !== 'all' ||
                dateFromFilter ||
                dateToFilter) && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl h-10"
                  onClick={handleClearFilters}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant overflow-hidden">
          {ticketsQuery.isPending ? (
            <div className="py-16 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 size={16} className="animate-spin" />
                Cargando tickets...
              </div>
            </div>
          ) : ticketsQuery.isError ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No pudimos cargar los tickets"
              description="Ocurrió un error al consultar el backend. Intenta nuevamente."
              action={
                <Button variant="outline" className="rounded-xl" onClick={() => ticketsQuery.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : table.getRowModel().rows.length === 0 ? (
            <EmptyState
              icon={<Receipt size={32} />}
              title="No hay tickets para estos filtros."
              description="Prueba otro rango de fechas, categoría o búsqueda. Limpiar filtros muestra de nuevo los tickets cargados."
              action={
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleClearFilters}
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-border/50">
                        {hg.headers.map((header) => (
                          <th key={header.id} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => handleOpenSheet(row.original)}
                        className="border-b border-border/30 hover:bg-surface-hover cursor-pointer transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                <p className="text-sm text-muted-foreground">
                  {table.getFilteredRowModel().rows.length} ticket{table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedTicket} onOpenChange={(open) => { if (!open) handleCloseSheet(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTicketDetail && (
            <div className="space-y-5">
              <SheetHeader>
                <div className="flex items-start justify-between gap-3">
                  <SheetTitle className="flex items-center gap-2">
                    <span className="text-foreground">{selectedTicketDetail.comercio}</span>
                    <StatusBadge status={selectedTicketDetail.estatus} />
                  </SheetTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg"
                    onClick={handleStartEdit}
                    disabled={!selectedTicket || updateMutation.isPending}
                    aria-label="Editar ticket"
                  >
                    <Edit3 size={14} className="mr-1.5" /> Editar
                  </Button>
                </div>
              </SheetHeader>

              {/* Imagen del ticket */}
              <TicketImagePreview
                imageUrl={selectedTicketDetail.imagenUrl}
                alt={`Ticket de ${selectedTicketDetail.comercio}`}
              />

              {/* Datos del ticket */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ...(selectedTicketDetail.folio ? [{ label: 'Folio', value: selectedTicketDetail.folio }] : []),
                  { label: 'Fecha', value: `${selectedTicketDetail.fecha} ${selectedTicketDetail.hora}` },
                  { label: 'Subtotal', value: formatMXN(selectedTicketDetail.subtotal) },
                  { label: 'IVA', value: formatMXN(selectedTicketDetail.iva) },
                  { label: 'Total', value: formatMXN(selectedTicketDetail.total) },
                  { label: 'Moneda', value: selectedTicketDetail.moneda },
                  { label: 'Método de pago', value: selectedTicketDetail.metodoPago },
                  { label: 'Tipo', value: selectedTicketDetail.tipo },
                  { label: 'Estatus', value: selectedTicketDetail.estatus },
                  { label: 'Revisión', value: selectedTicketDetail.reviewStatus },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium text-foreground">{f.value}</p>
                  </div>
                ))}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Categoría</p>
                  <CategoryBadge category={selectedTicketDetail.categoria} />
                </div>
              </div>

              <TicketNotes
                title="Productos detectados"
                sources={[detailQuery.data, selectedTicketDetail]}
              />

              {/* Formulario de edición */}
              {editing && draft ? (
                <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4">
                  <p className="text-xs font-medium text-foreground">Editar ticket</p>

                  {editReadonlyFields.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-background/70 p-3">
                      {editReadonlyFields.map((field) => (
                        <div key={field.label} className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <p className="text-sm font-medium text-foreground">{field.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <Select
                      value={draft.type}
                      onValueChange={(v) => updateDraft('type', v as BackendTicketType)}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Fecha</Label>
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) => updateDraft('date', e.target.value)}
                      className="h-9 rounded-lg text-sm bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Monto total</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.amount}
                      onChange={(e) => updateDraft('amount', e.target.value)}
                      className="h-9 rounded-lg text-sm bg-background"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Categoría</Label>
                    <Input
                      value={draft.category}
                      onChange={(e) => updateDraft('category', e.target.value)}
                      className="h-9 rounded-lg text-sm bg-background"
                      placeholder="Ej: Restaurantes y Alimentos"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Método de pago</Label>
                    <Select
                      value={draft.paymentMethod}
                      onValueChange={(v) => updateDraft('paymentMethod', v as BackendPaymentMethod)}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Estatus</Label>
                    <Select
                      value={draft.status}
                      onValueChange={(v) => updateDraft('status', v as BackendTicketStatus)}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BACKEND_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Revisión</Label>
                    <Select
                      value={draft.reviewStatus}
                      onValueChange={(v) => updateDraft('reviewStatus', v as BackendTicketReviewStatus)}
                    >
                      <SelectTrigger className="h-9 rounded-lg text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1 h-9 rounded-xl bg-gradient-primary text-primary-foreground transition-all hover:shadow-md hover:ring-2 hover:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none disabled:hover:ring-0"
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isPending || !canSaveEdit}
                    >
                      {updateMutation.isPending
                        ? <Loader2 size={14} className="mr-2 animate-spin" />
                        : <Save size={14} className="mr-2" />}
                      {updateMutation.isPending ? 'Guardando...' : canSaveEdit ? 'Guardar cambios' : 'Sin cambios'}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={handleCancelEdit}
                      disabled={updateMutation.isPending}
                    >
                      <XCircle size={14} className="mr-2" /> Cancelar
                    </Button>
                  </div>
                  {editValidationMessage ? (
                    <p className="text-xs text-destructive">{editValidationMessage}</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={handleStartEdit}
                    disabled={!canEdit || updateMutation.isPending}
                  >
                    <Edit3 size={14} className="mr-2" /> Editar
                  </Button>
                  {!canEdit && detailQuery.isLoading && (
                    <p className="text-xs text-muted-foreground">Cargando datos para editar...</p>
                  )}
                  {!canEdit && detailQuery.isError && (
                    <p className="text-xs text-muted-foreground">No se pudo cargar el ticket para editar.</p>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending || editing}
                  >
                    {deleteMutation.isPending
                      ? <Loader2 size={14} className="mr-2 animate-spin" />
                      : <Trash2 size={14} className="mr-2" />}
                    Eliminar
                  </Button>
                </div>
              )}

              {detailQuery.isFetching && (
                <p className="text-xs text-muted-foreground">Actualizando...</p>
              )}
              {detailQuery.isError && (
                <p className="text-xs text-destructive">No se pudo cargar el detalle completo.</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
