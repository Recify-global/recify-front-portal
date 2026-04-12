import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { MetricCard } from '@/components/recify/MetricCard';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { ConfidenceIndicator } from '@/components/recify/ConfidenceIndicator';
import { EmptyState } from '@/components/recify/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { dummyTickets, categorias, estatuses, type Ticket } from '@/data/dummy-tickets';
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
  ArrowUpDown, Download, Trash2, Edit3, FileImage, X,
} from 'lucide-react';

const formatMXN = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const columns: ColumnDef<Ticket>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.getValue('id')}</span>,
    size: 90,
  },
  {
    accessorKey: 'comercio',
    header: ({ column }) => (
      <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => column.toggleSorting()}>
        Comercio <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => <span className="font-medium text-foreground text-sm">{row.getValue('comercio')}</span>,
  },
  {
    accessorKey: 'fecha',
    header: ({ column }) => (
      <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => column.toggleSorting()}>
        Fecha <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue('fecha')}</span>,
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
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.getValue('metodoPago')}</span>,
  },
  {
    accessorKey: 'total',
    header: ({ column }) => (
      <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => column.toggleSorting()}>
        Total <ArrowUpDown size={12} />
      </button>
    ),
    cell: ({ row }) => <span className="font-semibold text-foreground text-sm">{formatMXN(row.getValue('total'))}</span>,
  },
  {
    accessorKey: 'estatus',
    header: 'Estatus',
    cell: ({ row }) => <StatusBadge status={row.getValue('estatus')} />,
    filterFn: 'equals',
  },
  {
    accessorKey: 'confianza',
    header: 'Confianza',
    cell: ({ row }) => <ConfidenceIndicator value={row.getValue('confianza')} />,
  },
];

export default function HistoryPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredData = useMemo(() => {
    let data = [...dummyTickets];
    if (categoryFilter !== 'all') data = data.filter(t => t.categoria === categoryFilter);
    if (statusFilter !== 'all') data = data.filter(t => t.estatus === statusFilter);
    return data;
  }, [categoryFilter, statusFilter]);

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

  const totalGasto = dummyTickets.reduce((acc, t) => acc + t.total, 0);
  const uniqueCategories = new Set(dummyTickets.map(t => t.categoria)).size;
  const pendientes = dummyTickets.filter(t => t.estatus === 'pendiente').length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de tickets</h1>
          <p className="text-muted-foreground mt-1">Todos tus comprobantes organizados y clasificados</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Tickets este mes" value={dummyTickets.length} subtitle="Abril 2025" icon={<Receipt size={20} />} />
          <MetricCard title="Gasto total" value={formatMXN(totalGasto)} subtitle="Abril 2025" icon={<DollarSign size={20} />} />
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
                onChange={e => setGlobalFilter(e.target.value)}
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
                {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36 h-10 rounded-xl border-border">
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {estatuses.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant overflow-hidden">
          {table.getRowModel().rows.length === 0 ? (
            <EmptyState
              icon={<Receipt size={32} />}
              title="Sin resultados"
              description="No se encontraron tickets con los filtros seleccionados."
              action={
                <Button variant="outline" className="rounded-xl" onClick={() => { setGlobalFilter(''); setCategoryFilter('all'); setStatusFilter('all'); }}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    {table.getHeaderGroups().map(hg => (
                      <tr key={hg.id} className="border-b border-border/50">
                        {hg.headers.map(header => (
                          <th key={header.id} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedTicket(row.original)}
                        className="border-b border-border/30 hover:bg-surface-hover cursor-pointer transition-colors"
                      >
                        {row.getVisibleCells().map(cell => (
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
      <Sheet open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTicket && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="text-foreground">{selectedTicket.id}</span>
                  <StatusBadge status={selectedTicket.estatus} />
                </SheetTitle>
              </SheetHeader>

              {/* Ticket preview placeholder */}
              <div className="bg-muted rounded-2xl h-40 flex items-center justify-center">
                <FileImage size={40} className="text-muted-foreground" />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Comercio', value: selectedTicket.comercio },
                    { label: 'Fecha', value: `${selectedTicket.fecha} ${selectedTicket.hora}` },
                    { label: 'Subtotal', value: formatMXN(selectedTicket.subtotal) },
                    { label: 'IVA', value: formatMXN(selectedTicket.iva) },
                    { label: 'Total', value: formatMXN(selectedTicket.total) },
                    { label: 'Moneda', value: selectedTicket.moneda },
                    { label: 'Método de pago', value: selectedTicket.metodoPago },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-xs text-muted-foreground">{f.label}</p>
                      <p className="text-sm font-medium text-foreground">{f.value}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Categoría</p>
                    <CategoryBadge category={selectedTicket.categoria} />
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Confianza del análisis</p>
                  <ConfidenceIndicator value={selectedTicket.confianza} />
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="text-sm text-foreground">{selectedTicket.notas}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button variant="outline" className="rounded-xl">
                  <Edit3 size={14} className="mr-2" /> Editar
                </Button>
                <Button variant="outline" className="rounded-xl">
                  <Download size={14} className="mr-2" /> Descargar
                </Button>
                <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive">
                  <Trash2 size={14} className="mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
