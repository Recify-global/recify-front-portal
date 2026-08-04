import { useEffect, useMemo, useRef, useState } from 'react';
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
  DialogDescription,
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useAuth } from '@/hooks/use-auth';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';
import { useCompanies } from '@/hooks/use-companies';
import { useDeleteInvoice, useInvoice, useInvoices } from '@/hooks/use-invoices';
import { getInvoice } from '@/services/invoices.service';
import type {
  BackendInvoice,
  BackendInvoiceType,
  InvoiceMatchStatus,
  InvoicesListParams,
} from '@/types/invoice';
import {
  INVOICE_TYPE_LABELS,
  formatInvoiceDate,
  formatInvoicePaymentForm,
  formatInvoiceUuid,
  invoiceTicketRefObject,
  invoiceUuidSearchText,
  resolveInvoiceFileUrl,
} from '@/utils/invoice-display';
import { HISTORY_TIMEZONE, formatMxn } from '@/utils/financial-kpis';
import { getInvoiceUserErrorMessage, isInvoiceAbortError } from '@/utils/invoice-errors';
import { AlertCircle, FileText, Loader2, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

type InvoiceTab = 'all' | InvoiceMatchStatus;

type InvoiceSelection = { companyId: string; invoiceId: string };

const PAGE_SIZE = 20;

const TAB_OPTIONS: { value: InvoiceTab; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'unmatched', label: 'Sin ticket' },
  { value: 'suggested', label: 'Sugeridas' },
  { value: 'missing_ticket', label: 'Ticket faltante' },
  { value: 'auto', label: 'Auto' },
  { value: 'confirmed', label: 'Confirmadas' },
];

/** RFC mexicano típico (12–13 chars). No inventa filtro si no parece RFC. */
function looksLikeIssuerRfc(value: string): boolean {
  const v = value.trim().toUpperCase();
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/.test(v);
}

export default function InvoicesPage() {
  const [tab, setTab] = useState<InvoiceTab>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | BackendInvoiceType>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<InvoiceSelection | null>(null);
  const [localDetail, setLocalDetail] = useState<BackendInvoice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    companyId: string;
    invoice: BackendInvoice;
  } | null>(null);

  const { companyId } = useAuth();
  const { activeCompany } = useCompanies();
  const timeZone = activeCompany?.timezone?.trim() || HISTORY_TIMEZONE;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const deleteClaimRef = useRef(false);
  const pdfClaimRef = useRef(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const listParams = useMemo((): InvoicesListParams => {
    const params: InvoicesListParams = {
      page,
      limit: PAGE_SIZE,
    };
    if (tab !== 'all') params.matchStatus = tab;
    if (typeFilter !== 'all') params.type = typeFilter;
    if (dateFromFilter) params.dateFrom = dateFromFilter;
    if (dateToFilter) params.dateTo = dateToFilter;
    const search = searchFilter.trim();
    if (search && looksLikeIssuerRfc(search)) {
      params.issuerRfc = search.toUpperCase();
    }
    return params;
  }, [page, tab, typeFilter, dateFromFilter, dateToFilter, searchFilter]);

  const invoicesQuery = useInvoices(listParams);
  const detailQuery = useInvoice(selection);
  const deleteMutation = useDeleteInvoice();

  // Reset de filtros/selección al cambiar compañía (sincrónico con el render activo).
  useEffect(() => {
    setTab('all');
    setTypeFilter('all');
    setSearchFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setPage(1);
    setSelection(null);
    setLocalDetail(null);
    setPendingDelete(null);
    deleteClaimRef.current = false;
    pdfClaimRef.current = false;
    setPdfBusyId(null);
  }, [companyId]);

  useEffect(() => {
    setLocalDetail(null);
  }, [selection?.invoiceId, selection?.companyId]);

  const invoices = useMemo(() => invoicesQuery.data?.data ?? [], [invoicesQuery.data]);
  const total = invoicesQuery.data?.total ?? 0;
  const pages = Math.max(1, invoicesQuery.data?.pages ?? 1);

  const pageSearch = searchFilter.trim().toLowerCase();
  const applyPageLocalSearch = Boolean(pageSearch) && !looksLikeIssuerRfc(searchFilter);

  const visibleInvoices = useMemo(() => {
    if (!applyPageLocalSearch) return invoices;
    return invoices.filter((inv) => {
      const rfc = (inv.issuerRfc ?? '').toLowerCase();
      const name = (inv.issuerName ?? '').toLowerCase();
      const uuid = invoiceUuidSearchText(inv.uuid);
      return rfc.includes(pageSearch) || name.includes(pageSearch) || uuid.includes(pageSearch);
    });
  }, [invoices, applyPageLocalSearch, pageSearch]);

  const hasFilters =
    typeFilter !== 'all' ||
    searchFilter !== '' ||
    dateFromFilter !== '' ||
    dateToFilter !== '' ||
    tab !== 'all';

  const clearFilters = () => {
    setTypeFilter('all');
    setSearchFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setTab('all');
    setPage(1);
  };

  const openDetail = (invoice: BackendInvoice) => {
    if (!companyId) return;
    setSelection({ companyId, invoiceId: invoice._id });
  };

  const closeDetail = () => {
    setSelection(null);
    setLocalDetail(null);
  };

  const listPreview =
    selection && selection.companyId === companyId
      ? invoices.find((inv) => inv._id === selection.invoiceId) ?? null
      : null;

  const detailMatchesSelection =
    detailQuery.data &&
    selection &&
    detailQuery.data._id === selection.invoiceId;

  const selectedInvoice: BackendInvoice | null = (() => {
    if (!selection || selection.companyId !== companyId) return null;
    if (localDetail && localDetail._id === selection.invoiceId) return localDetail;
    if (detailMatchesSelection) return detailQuery.data ?? null;
    return listPreview;
  })();

  const detailError =
    Boolean(selection) &&
    selection?.companyId === companyId &&
    detailQuery.isError &&
    !detailMatchesSelection;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    if (deleteClaimRef.current) return;
    deleteClaimRef.current = true;
    const origin = pendingDelete;
    const originCompanyId = origin.companyId;
    const invoiceId = origin.invoice._id;
    const authContext = captureAuthMutationContext();
    try {
      await deleteMutation.mutateAsync({
        companyId: originCompanyId,
        invoiceId,
      });
      if (
        isAuthMutationContextCurrent(authContext) &&
        companyIdRef.current === originCompanyId
      ) {
        toast.success('Factura eliminada.');
        if (selection?.invoiceId === invoiceId) closeDetail();
        setPendingDelete(null);
      }
    } catch (err) {
      if (
        isAuthMutationContextCurrent(authContext) &&
        !isInvoiceAbortError(err) &&
        companyIdRef.current === originCompanyId
      ) {
        const message = getInvoiceUserErrorMessage(err, 'No fue posible eliminar la factura.');
        if (message) toast.error(message);
      }
    } finally {
      deleteClaimRef.current = false;
    }
  };

  const openPdf = async (invoice: BackendInvoice) => {
    if (!companyId) return;
    if (pdfClaimRef.current) return;
    const originCompanyId = companyId;
    const authContext = captureAuthMutationContext();
    pdfClaimRef.current = true;
    setPdfBusyId(invoice._id);
    try {
      const fresh = await getInvoice(originCompanyId, invoice._id);
      if (
        !isAuthMutationContextCurrent(authContext) ||
        companyIdRef.current !== originCompanyId
      ) return;
      const pdfUrl = resolveInvoiceFileUrl(fresh.fileUrl);
      if (!pdfUrl) {
        toast.error('No hay un PDF disponible para esta factura.');
        return;
      }
      const popup = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        toast.error('El navegador bloqueó la ventana del PDF. Permite ventanas emergentes e intenta de nuevo.');
      }
    } catch (err) {
      if (isInvoiceAbortError(err)) return;
      if (
        !isAuthMutationContextCurrent(authContext) ||
        companyIdRef.current !== originCompanyId
      ) return;
      const message = getInvoiceUserErrorMessage(
        err,
        'No se pudo obtener el PDF. Intenta de nuevo.',
      );
      if (message) toast.error(message);
    } finally {
      pdfClaimRef.current = false;
      if (isAuthMutationContextCurrent(authContext)) {
        setPdfBusyId(null);
      }
    }
  };

  const dialogOpen = Boolean(selection && selection.companyId === companyId);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturas</h1>
          <p className="text-muted-foreground mt-1">
            CFDI recibidos y emitidos, conciliados con tus tickets
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as InvoiceTab);
            setPage(1);
          }}
        >
          <TabsList className="rounded-xl w-full max-w-full justify-start overflow-x-auto flex-nowrap h-auto p-1">
            {TAB_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="rounded-lg shrink-0"
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invoice-search" className="text-xs text-muted-foreground">
                Buscar
              </Label>
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                <Search size={16} className="text-muted-foreground shrink-0" aria-hidden />
                <input
                  id="invoice-search"
                  type="search"
                  placeholder="RFC exacto, o emisor/folio en esta página…"
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
                />
                {searchFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchFilter('');
                      setPage(1);
                    }}
                    aria-label="Limpiar búsqueda"
                    className="shrink-0 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X size={14} className="text-muted-foreground" aria-hidden />
                  </button>
                ) : null}
              </div>
              {applyPageLocalSearch ? (
                <p className="text-xs text-muted-foreground">
                  La búsqueda por emisor o folio aplica solo a esta página. Un RFC completo se
                  consulta en el servidor.
                </p>
              ) : null}
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as 'all' | BackendInvoiceType);
                setPage(1);
              }}
            >
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
                onChange={(e) => {
                  setDateFromFilter(e.target.value);
                  setPage(1);
                }}
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
                onChange={(e) => {
                  setDateToFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border-border"
              />
            </div>
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl h-10"
                onClick={clearFilters}
              >
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 shadow-elegant overflow-hidden">
          {invoicesQuery.isPending && !invoicesQuery.data ? (
            <div className="p-6 space-y-3" aria-busy="true" aria-live="polite">
              <span className="sr-only">Cargando facturas</span>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoicesQuery.isError ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No se pudieron cargar las facturas"
              description={
                getInvoiceUserErrorMessage(
                  invoicesQuery.error,
                  'Ocurrió un error al consultar el servidor. Intenta de nuevo.',
                ) || 'Ocurrió un error al consultar el servidor. Intenta de nuevo.'
              }
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
          ) : visibleInvoices.length === 0 ? (
            <EmptyState
              icon={<FileText size={32} />}
              title={total === 0 ? 'Sin facturas' : 'Sin resultados'}
              description={
                total === 0
                  ? 'Sube un CFDI en PDF desde la pantalla de Subir ticket.'
                  : applyPageLocalSearch
                    ? 'Ninguna factura de esta página coincide con la búsqueda.'
                    : 'Ninguna factura coincide con los filtros seleccionados.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" className="rounded-xl" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
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
                    {visibleInvoices.map((invoice) => (
                      <TableRow
                        key={invoice._id}
                        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir factura de ${invoice.issuerName ?? 'emisor desconocido'}`}
                        onClick={() => openDetail(invoice)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(invoice);
                          }
                        }}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatInvoiceDate(invoice.date, timeZone)}
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
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => void openPdf(invoice)}
                              disabled={pdfBusyId === invoice._id}
                              aria-label="Abrir PDF"
                            >
                              {pdfBusyId === invoice._id ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <FileText size={15} />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg text-destructive hover:text-destructive"
                              onClick={() => {
                                if (!companyId) return;
                                setPendingDelete({ companyId, invoice });
                              }}
                              disabled={deleteMutation.isPending}
                              aria-label="Eliminar factura"
                            >
                              {deleteMutation.isPending &&
                              pendingDelete?.invoice._id === invoice._id ? (
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

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {total === 0
                    ? 'Sin resultados'
                    : `Página ${page} de ${pages} · ${total} factura${total === 1 ? '' : 's'}`}
                </p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-disabled={page <= 1 || invoicesQuery.isFetching}
                        className={
                          page <= 1 || invoicesQuery.isFetching
                            ? 'pointer-events-none opacity-50'
                            : undefined
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          if (page > 1) setPage((p) => p - 1);
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-disabled={page >= pages || invoicesQuery.isFetching}
                        className={
                          page >= pages || invoicesQuery.isFetching
                            ? 'pointer-events-none opacity-50'
                            : undefined
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          if (page < pages) setPage((p) => p + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {selectedInvoice
                ? `Factura de ${selectedInvoice.issuerName ?? 'emisor desconocido'}`
                : 'Detalle de factura'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detalle fiscal y conciliación de la factura seleccionada
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isPending && !selectedInvoice ? (
            <div className="space-y-3 py-4" aria-busy="true">
              <span className="sr-only">Cargando detalle</span>
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {detailError ? (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3"
              role="alert"
            >
              <p className="text-sm text-foreground">
                {getInvoiceUserErrorMessage(
                  detailQuery.error,
                  'No se pudo cargar el detalle de la factura.',
                ) || 'No se pudo cargar el detalle de la factura.'}
              </p>
              {listPreview ? (
                <p className="text-xs text-muted-foreground">
                  Se muestra un resumen parcial del listado mientras el detalle no carga.
                </p>
              ) : null}
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => void detailQuery.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : null}

          {selectedInvoice ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <InvoiceMatchStatusBadge status={selectedInvoice.matchStatus} />
                {detailQuery.isFetching ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden />
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Folio fiscal (UUID)</p>
                  <p className="font-mono text-xs break-all text-foreground">
                    {formatInvoiceUuid(selectedInvoice.uuid)}
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
                  <p className="text-foreground">
                    {formatInvoiceDate(selectedInvoice.date, timeZone)}
                  </p>
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

              {companyId && selection?.companyId === companyId ? (
                <InvoiceMatchPanel
                  companyId={selection.companyId}
                  activeCompanyId={companyId}
                  invoice={selectedInvoice}
                  linkedTicket={invoiceTicketRefObject(selectedInvoice.ticketId)}
                  initialCandidates={selectedInvoice.matchCandidates}
                  onInvoiceChange={setLocalDetail}
                  timeZone={timeZone}
                />
              ) : null}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-xl"
                  onClick={() => void openPdf(selectedInvoice)}
                  disabled={pdfBusyId === selectedInvoice._id}
                >
                  {pdfBusyId === selectedInvoice._id ? (
                    <Loader2 size={15} className="mr-2 animate-spin" />
                  ) : (
                    <FileText size={15} className="mr-2" />
                  )}
                  Abrir PDF
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!companyId) return;
                    setPendingDelete({ companyId, invoice: selectedInvoice });
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 size={15} className="mr-2" /> Eliminar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete && pendingDelete.companyId === companyId)}
        onOpenChange={(open) => {
          // No limpiar el payload mientras hay un DELETE en vuelo (claim).
          if (!open && !deleteClaimRef.current && !deleteMutation.isPending) {
            setPendingDelete(null);
          }
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
            <AlertDialogCancel disabled={deleteMutation.isPending || deleteClaimRef.current}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Eliminando…
                </>
              ) : (
                'Eliminar factura'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
