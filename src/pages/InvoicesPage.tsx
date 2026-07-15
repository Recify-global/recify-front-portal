import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { EmptyState } from '@/components/recify/EmptyState';
import { InvoiceMatchStatusBadge } from '@/components/recify/InvoiceMatchStatusBadge';
import { InvoiceMatchPanel } from '@/components/recify/InvoiceMatchPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useDeleteInvoice, useInvoice, useInvoices } from '@/hooks/use-invoices';
import type { BackendInvoice, InvoiceMatchStatus } from '@/types/invoice';
import {
  INVOICE_TYPE_LABELS,
  formatInvoiceDate,
  formatInvoicePaymentForm,
  invoiceTicketRefObject,
} from '@/utils/invoice-display';
import { formatMxn } from '@/utils/financial-kpis';
import { ApiRequestError } from '@/api/http';
import { AlertCircle, FileText, Loader2, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

type InvoiceTab = 'all' | 'sin-ticket' | 'faltante' | 'conciliadas';

const TAB_STATUSES: Record<Exclude<InvoiceTab, 'all'>, InvoiceMatchStatus[]> = {
  'sin-ticket': ['unmatched', 'suggested'],
  faltante: ['missing_ticket'],
  conciliadas: ['auto', 'confirmed'],
};

/** Fecha de la factura como clave YYYY-MM-DD (parte de fecha del ISO en UTC). */
function invoiceDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function InvoicesPage() {
  const [tab, setTab] = useState<InvoiceTab>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [rfcFilter, setRfcFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackendInvoice | null>(null);

  const { companyId } = useAuth();
  const invoicesQuery = useInvoices({ page: 1, limit: 100 });
  const detailQuery = useInvoice(selectedInvoiceId);
  const deleteMutation = useDeleteInvoice();

  // P0 multitenant: al cambiar compañía se cierra el detalle abierto.
  useEffect(() => {
    setSelectedInvoiceId(null);
    setPendingDelete(null);
  }, [companyId]);

  const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);

  const filtered = useMemo(() => {
    let data = invoices;
    if (tab !== 'all') {
      const statuses = TAB_STATUSES[tab];
      data = data.filter((inv) => statuses.includes(inv.matchStatus));
    }
    if (typeFilter !== 'all') data = data.filter((inv) => inv.type === typeFilter);
    const rfc = rfcFilter.trim().toLowerCase();
    if (rfc) {
      data = data.filter(
        (inv) =>
          (inv.issuerRfc ?? '').toLowerCase().includes(rfc) ||
          (inv.issuerName ?? '').toLowerCase().includes(rfc) ||
          inv.uuid.toLowerCase().includes(rfc),
      );
    }
    if (dateFromFilter) data = data.filter((inv) => invoiceDateKey(inv.date) >= dateFromFilter);
    if (dateToFilter) data = data.filter((inv) => invoiceDateKey(inv.date) <= dateToFilter);
    return data;
  }, [invoices, tab, typeFilter, rfcFilter, dateFromFilter, dateToFilter]);

  const hasFilters =
    typeFilter !== 'all' || rfcFilter !== '' || dateFromFilter !== '' || dateToFilter !== '';

  const clearFilters = () => {
    setTypeFilter('all');
    setRfcFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  };

  const tabCounts = useMemo(() => {
    const count = (statuses: InvoiceMatchStatus[]) =>
      invoices.filter((inv) => statuses.includes(inv.matchStatus)).length;
    return {
      all: invoices.length,
      'sin-ticket': count(TAB_STATUSES['sin-ticket']),
      faltante: count(TAB_STATUSES.faltante),
      conciliadas: count(TAB_STATUSES.conciliadas),
    };
  }, [invoices]);

  // El detalle populado manda; el registro del listado es fallback mientras carga.
  const selectedInvoice: BackendInvoice | null = useMemo(() => {
    if (!selectedInvoiceId) return null;
    if (detailQuery.data && detailQuery.data._id === selectedInvoiceId) return detailQuery.data;
    return invoices.find((inv) => inv._id === selectedInvoiceId) ?? null;
  }, [selectedInvoiceId, detailQuery.data, invoices]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync({ invoiceId: pendingDelete._id });
      toast.success('Factura eliminada.');
      if (selectedInvoiceId === pendingDelete._id) setSelectedInvoiceId(null);
    } catch (err) {
      const message =
        err instanceof ApiRequestError || err instanceof Error
          ? err.message
          : 'No fue posible eliminar la factura.';
      toast.error(message || 'No fue posible eliminar la factura.');
    } finally {
      setPendingDelete(null);
    }
  };

  const openPdf = (invoice: BackendInvoice) => {
    // La URL viene firmada y vale 1 hora; se abre directo sin cachear.
    window.open(invoice.fileUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturas</h1>
          <p className="text-muted-foreground mt-1">
            CFDI recibidos y emitidos, conciliados con tus tickets
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as InvoiceTab)}>
          <TabsList className="rounded-xl">
            <TabsTrigger value="all" className="rounded-lg">
              Todas ({tabCounts.all})
            </TabsTrigger>
            <TabsTrigger value="sin-ticket" className="rounded-lg">
              Sin ticket ({tabCounts['sin-ticket']})
            </TabsTrigger>
            <TabsTrigger value="faltante" className="rounded-lg">
              Ticket faltante ({tabCounts.faltante})
            </TabsTrigger>
            <TabsTrigger value="conciliadas" className="rounded-lg">
              Conciliadas ({tabCounts.conciliadas})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Buscar por RFC, emisor o folio fiscal..."
                value={rfcFilter}
                onChange={(e) => setRfcFilter(e.target.value)}
                className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
              />
              {rfcFilter && (
                <button type="button" onClick={() => setRfcFilter('')}>
                  <X size={14} className="text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl border-border">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="egreso">{INVOICE_TYPE_LABELS.egreso}</SelectItem>
                <SelectItem value="ingreso">{INVOICE_TYPE_LABELS.ingreso}</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-1.5 w-full sm:w-40">
              <Label htmlFor="invoice-date-from" className="text-xs text-muted-foreground">
                Desde
              </Label>
              <Input
                id="invoice-date-from"
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                className="h-10 rounded-xl border-border"
              />
            </div>
            <div className="space-y-1.5 w-full sm:w-40">
              <Label htmlFor="invoice-date-to" className="text-xs text-muted-foreground">
                Hasta
              </Label>
              <Input
                id="invoice-date-to"
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                className="h-10 rounded-xl border-border"
              />
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl h-10"
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Listado */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant overflow-hidden">
          {invoicesQuery.isPending ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoicesQuery.isError ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No se pudieron cargar las facturas"
              description="Ocurrió un error al consultar el servidor. Intenta de nuevo."
              action={
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void invoicesQuery.refetch()}
                >
                  Reintentar
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText size={32} />}
              title={invoices.length === 0 ? 'Sin facturas' : 'Sin resultados'}
              description={
                invoices.length === 0
                  ? 'Sube un CFDI en PDF desde la pantalla de Subir ticket.'
                  : 'Ninguna factura coincide con los filtros seleccionados.'
              }
              action={
                invoices.length > 0 && (hasFilters || tab !== 'all') ? (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      clearFilters();
                      setTab('all');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Emisor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Conciliación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((invoice) => (
                    <TableRow
                      key={invoice._id}
                      className="cursor-pointer"
                      onClick={() => setSelectedInvoiceId(invoice._id)}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatInvoiceDate(invoice.date)}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 max-w-[280px]">
                          <p className="truncate text-sm font-medium text-foreground">
                            {invoice.issuerName ?? 'Sin emisor'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {invoice.issuerRfc ?? '—'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {INVOICE_TYPE_LABELS[invoice.type] ?? invoice.type}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">
                        {formatMxn(invoice.total)}
                      </TableCell>
                      <TableCell>
                        <InvoiceMatchStatusBadge status={invoice.matchStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg"
                            onClick={() => openPdf(invoice)}
                            aria-label="Abrir PDF"
                          >
                            <FileText size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-destructive hover:text-destructive"
                            onClick={() => setPendingDelete(invoice)}
                            disabled={deleteMutation.isPending}
                            aria-label="Eliminar factura"
                          >
                            {deleteMutation.isPending &&
                            pendingDelete?._id === invoice._id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      <Dialog
        open={Boolean(selectedInvoice)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceId(null);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          {selectedInvoice ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">
                  Factura de {selectedInvoice.issuerName ?? 'emisor desconocido'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <InvoiceMatchStatusBadge status={selectedInvoice.matchStatus} />
                  {detailQuery.isFetching && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-0.5 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Folio fiscal (UUID)</p>
                    <p className="font-mono text-xs break-all text-foreground">
                      {selectedInvoice.uuid}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Emisor</p>
                    <p className="font-medium text-foreground">
                      {selectedInvoice.issuerName ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedInvoice.issuerRfc ?? '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Receptor</p>
                    <p className="font-medium text-foreground">
                      {selectedInvoice.receiverName ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedInvoice.receiverRfc ?? '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Fecha</p>
                    <p className="text-foreground">{formatInvoiceDate(selectedInvoice.date)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-foreground">
                      {INVOICE_TYPE_LABELS[selectedInvoice.type] ?? selectedInvoice.type}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="text-foreground">
                      {selectedInvoice.subtotal !== null
                        ? formatMxn(selectedInvoice.subtotal)
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">IVA</p>
                    <p className="text-foreground">
                      {selectedInvoice.tax !== null ? formatMxn(selectedInvoice.tax) : '—'}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold text-foreground">
                      {formatMxn(selectedInvoice.total)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Forma / método de pago</p>
                    <p className="text-foreground">
                      {formatInvoicePaymentForm(selectedInvoice.paymentForm)}
                      {selectedInvoice.paymentMethod ? ` · ${selectedInvoice.paymentMethod}` : ''}
                    </p>
                  </div>
                </div>

                <InvoiceMatchPanel
                  invoice={selectedInvoice}
                  linkedTicket={invoiceTicketRefObject(selectedInvoice.ticketId)}
                  initialCandidates={selectedInvoice.matchCandidates}
                />

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 rounded-xl"
                    onClick={() => openPdf(selectedInvoice)}
                  >
                    <FileText size={15} className="mr-2" /> Abrir PDF
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(selectedInvoice)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={15} className="mr-2" /> Eliminar
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el PDF de forma definitiva y, si estaba vinculada, el ticket quedará sin
              factura. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Eliminar factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
