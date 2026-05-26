import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { MetricCard } from '@/components/recify/MetricCard';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
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
import { mapBackendTicket, mapBackendTickets } from '@/mappers/ticket.mapper';
import { useTicket, useTickets, useUpdateTicket } from '@/hooks/use-tickets';
import { useAuth } from '@/hooks/use-auth';
import { deleteTicket } from '@/services/tickets.service';
import type {
  BackendPaymentMethod,
  BackendTicketReviewStatus,
  BackendTicketStatus,
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
  { value: 'card', label: 'Tarjeta de crédito' },
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

function labelToPaymentMethod(label: string): BackendPaymentMethod {
  const match = PAYMENT_OPTIONS.find((o) => o.label === label);
  return match?.value ?? 'other';
}

function labelToBackendStatus(label: string): BackendTicketStatus {
  const match = BACKEND_STATUS_OPTIONS.find((o) => o.label === label);
  return match?.value ?? 'pending';
}

export default function HistoryPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<UiTicket | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [draftCategory, setDraftCategory] = useState('');
  const [draftPaymentMethod, setDraftPaymentMethod] = useState<BackendPaymentMethod>('other');
  const [draftStatus, setDraftStatus] = useState<BackendTicketStatus>('pending');
  const [draftReviewStatus, setDraftReviewStatus] = useState<BackendTicketReviewStatus>('pendiente');

  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  const ticketsQuery = useTickets({ page: 1, limit: 100 });
  const detailQuery = useTicket(selectedTicket?.id);
  const updateMutation = useUpdateTicket();

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
    return data;
  }, [tickets, categoryFilter, statusFilter]);

  const selectedTicketDetail = useMemo(() => {
    if (detailQuery.data) return mapBackendTicket(detailQuery.data);
    return selectedTicket;
  }, [detailQuery.data, selectedTicket]);

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
    setEditing(false);
    setDraftCategory(ticket.categoria);
    setDraftPaymentMethod(labelToPaymentMethod(ticket.metodoPago));
    setDraftStatus(labelToBackendStatus(
      ticket.estatus === 'analizado' ? 'Analizado' :
      ticket.estatus === 'error' ? 'Error' : 'Pendiente',
    ));
    setDraftReviewStatus('pendiente');
  };

  const handleCloseSheet = () => {
    setSelectedTicket(null);
    setEditing(false);
  };

  const handleStartEdit = () => {
    if (!selectedTicketDetail) return;
    setDraftCategory(selectedTicketDetail.categoria);
    setDraftPaymentMethod(labelToPaymentMethod(selectedTicketDetail.metodoPago));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTicketDetail?.id) return;
    try {
      await updateMutation.mutateAsync({
        ticketId: selectedTicketDetail.id,
        payload: {
          category: draftCategory || undefined,
          paymentMethod: draftPaymentMethod,
          status: draftStatus,
          reviewStatus: draftReviewStatus,
        },
      });
      toast.success('Cambios guardados.');
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron guardar los cambios.';
      toast.error(message);
    }
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
                <button onClick={() => setGlobalFilter('')}>
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
              title="Sin resultados"
              description="No se encontraron tickets con los filtros seleccionados."
              action={
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => { setGlobalFilter(''); setCategoryFilter('all'); setStatusFilter('all'); }}
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
      <Sheet open={!!selectedTicket} onOpenChange={handleCloseSheet}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTicketDetail && (
            <div className="space-y-5">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-foreground">{selectedTicketDetail.comercio}</span>
                  <StatusBadge status={selectedTicketDetail.estatus} />
                </SheetTitle>
              </SheetHeader>

              {/* Imagen del ticket */}
              <TicketImagePreview
                imageUrl={selectedTicketDetail.imagenUrl}
                alt={`Ticket de ${selectedTicketDetail.comercio}`}
              />

              {/* Datos del ticket */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Fecha', value: `${selectedTicketDetail.fecha} ${selectedTicketDetail.hora}` },
                  { label: 'Subtotal', value: formatMXN(selectedTicketDetail.subtotal) },
                  { label: 'IVA', value: formatMXN(selectedTicketDetail.iva) },
                  { label: 'Total', value: formatMXN(selectedTicketDetail.total) },
                  { label: 'Moneda', value: selectedTicketDetail.moneda },
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

              {selectedTicketDetail.notas && selectedTicketDetail.notas !== 'Sin notas' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-sm text-foreground">{selectedTicketDetail.notas}</p>
                </div>
              )}

              {/* Formulario de edición */}
              {editing ? (
                <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4">
                  <p className="text-xs font-medium text-foreground">Editar campos</p>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Categoría</Label>
                    <Input
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value)}
                      className="h-9 rounded-lg text-sm bg-background"
                      placeholder="Ej: Alimentos"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Método de pago</Label>
                    <Select
                      value={draftPaymentMethod}
                      onValueChange={(v) => setDraftPaymentMethod(v as BackendPaymentMethod)}
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
                      value={draftStatus}
                      onValueChange={(v) => setDraftStatus(v as BackendTicketStatus)}
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
                      value={draftReviewStatus}
                      onValueChange={(v) => setDraftReviewStatus(v as BackendTicketReviewStatus)}
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
                      className="flex-1 h-9 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending
                        ? <Loader2 size={14} className="mr-2 animate-spin" />
                        : <Save size={14} className="mr-2" />}
                      Guardar
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={() => setEditing(false)}
                      disabled={updateMutation.isPending}
                    >
                      <XCircle size={14} className="mr-2" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={handleStartEdit}
                  >
                    <Edit3 size={14} className="mr-2" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
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
