import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { MetricCard } from '@/components/recify/MetricCard';
import { SkeletonCard } from '@/components/recify/SkeletonCard';
import { HistoryTicketTable } from '@/components/recify/HistoryTicketTable';
import { TicketImageDialog } from '@/components/recify/TicketImageDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Receipt, ArrowDownCircle, ArrowUpCircle, Scale, CreditCard,
  AlertCircle, Search, X, Loader2, Info,
} from 'lucide-react';
import { mapBackendTickets } from '@/mappers/ticket.mapper';
import {
  useDashboardDailyReport,
  useTickets,
  useUpdateDashboardTicket,
} from '@/hooks/use-tickets';
import {
  saveHistoryTicketDrafts,
  useHistoryTableEditing,
} from '@/hooks/use-history-table-editing';
import { useFinancialKpis } from '@/hooks/use-financial-kpis';
import { useAuth } from '@/hooks/use-auth';
import { isAuthSessionClosing } from '@/auth/session-cleanup';
import { deleteTicket } from '@/services/tickets.service';
import {
  DATE_PRESETS,
  dateRangeForPreset,
  detectActivePreset,
  formatMxn,
  isValidDateRange,
  last12MonthsRange,
  type DatePresetId,
} from '@/utils/financial-kpis';
import { selectTicketImageUrl, mergeTicketImageUrl } from '@/utils/ticket-image';
import { cn } from '@/lib/utils';
import type { UiTicket } from '@/types/ticket';

interface SelectedTicketImage {
  ticketId: string;
  companyId: string;
  imageUrl: string;
  alt: string;
}

const formatMXN = (n: number) => formatMxn(n);

const statusOptions = ['analizado', 'pendiente', 'error'] as const;

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
  const [periodReference] = useState(() => new Date());
  const [initialDateRange] = useState(() => last12MonthsRange(periodReference));
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedTicketImage | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState(initialDateRange.dateFrom);
  const [dateToFilter, setDateToFilter] = useState(initialDateRange.dateTo);
  const [isSavingTable, setIsSavingTable] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [isImageRetrying, setIsImageRetrying] = useState(false);

  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const companyIdRef = useRef(companyId);
  const previousCompanyIdRef = useRef(companyId);
  const savingClaimRef = useRef(false);
  const imageRetryCountRef = useRef(0);
  const tableEditing = useHistoryTableEditing();
  const { cancelEditing, isTableEditing } = tableEditing;
  companyIdRef.current = companyId;

  // P0 multitenant: una imagen nunca sobrevive al cambio de compañía.
  useEffect(() => {
    if (previousCompanyIdRef.current !== companyId) {
      setSelectedImage(null);
      imageRetryCountRef.current = 0;
      if (previousCompanyIdRef.current && isTableEditing) {
        cancelEditing();
        if (companyId && !isAuthSessionClosing()) {
          toast.info('La edición se canceló al cambiar de compañía.');
        }
      }
    }
    previousCompanyIdRef.current = companyId;
  }, [cancelEditing, companyId, isTableEditing]);

  const ticketsQuery = useTickets({
    page: 1,
    limit: 100,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
  });
  const dailyReportQuery = useDashboardDailyReport({
    page: 1,
    limit: 100,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
  });
  const updateMutation = useUpdateDashboardTicket();

  const financialKpis = useFinancialKpis({
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
    category: categoryFilter,
  });
  const activePreset = detectActivePreset(dateFromFilter, dateToFilter, periodReference);
  const dateRangeInvalid = !isValidDateRange(dateFromFilter, dateToFilter);

  const backendTickets = useMemo(() => {
    const dailyById = new Map(
      (dailyReportQuery.data?.tickets ?? []).map((ticket) => [ticket._id, ticket]),
    );
    return (ticketsQuery.data?.data ?? []).map((ticket) => {
      const dailyTicket = dailyById.get(ticket._id);
      if (!dailyTicket || dailyTicket.companyId !== ticket.companyId) return ticket;
      return {
        ...ticket,
        ...dailyTicket,
        rawData: dailyTicket.rawData ?? ticket.rawData,
        vendor: dailyTicket.vendor ?? ticket.vendor,
        imageUrl: mergeTicketImageUrl(ticket, dailyTicket),
        tax: dailyTicket.tax ?? ticket.tax,
        subtotal: dailyTicket.subtotal ?? ticket.subtotal,
      };
    });
  }, [dailyReportQuery.data?.tickets, ticketsQuery.data?.data]);
  const tickets = useMemo(() => mapBackendTickets(backendTickets), [backendTickets]);
  const backendTicketById = useMemo(
    () => new Map(backendTickets.map((ticket) => [ticket._id, ticket])),
    [backendTickets],
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

  const applyDatePreset = (preset: DatePresetId) => {
    const range = dateRangeForPreset(preset, periodReference);
    setDateFromFilter(range.dateFrom);
    setDateToFilter(range.dateTo);
  };

  const deleteMutation = useMutation({
    mutationFn: async ({
      ticketId,
      originCompanyId,
    }: {
      ticketId: string;
      originCompanyId: string;
    }) => {
      await deleteTicket(originCompanyId, ticketId);
    },
    onMutate: ({ ticketId }) => {
      setDeletingTicketId(ticketId);
    },
    onSuccess: async (_data, { originCompanyId }) => {
      if (isAuthSessionClosing()) return;
      toast.success('Ticket eliminado.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets', originCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-daily-report', originCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary', originCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-by-payment-method', originCompanyId] }),
      ]);
    },
    onError: () => {
      if (isAuthSessionClosing()) return;
      toast.error('No fue posible eliminar el ticket.');
    },
    onSettled: () => {
      if (isAuthSessionClosing()) return;
      setDeletingTicketId(null);
    },
  });

  const handlePreviewImage = (ticket: UiTicket) => {
    const backendTicket = backendTicketById.get(ticket.id);
    const imageUrl = selectTicketImageUrl(companyId, ticket.id, null, {
      ticketId: ticket.id,
      companyId: companyId ?? '',
      imageUrl: backendTicket?.imageUrl ?? ticket.imagenUrl,
    });
    if (!companyId || !imageUrl) return;
    imageRetryCountRef.current = 0;
    setSelectedImage({
      ticketId: ticket.id,
      companyId,
      imageUrl,
      alt: `Ticket de ${ticket.comercio}`,
    });
  };

  const handleImageRetry = async () => {
    if (!selectedImage || !companyId || isImageRetrying) return;
    if (imageRetryCountRef.current >= 1) return;

    imageRetryCountRef.current += 1;
    setIsImageRetrying(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['tickets', companyId] }),
        queryClient.refetchQueries({ queryKey: ['dashboard-daily-report', companyId] }),
      ]);

      const ticketsData = queryClient.getQueryData([
        'tickets',
        companyId,
        {
          page: 1,
          limit: 100,
          dateFrom: dateFromFilter,
          dateTo: dateToFilter,
        },
      ]) as {
        data?: Array<{ _id: string; companyId: string; imageUrl?: string | null }>;
      } | undefined;
      const dailyData = queryClient.getQueryData([
        'dashboard-daily-report',
        companyId,
        {
          page: 1,
          limit: 100,
          dateFrom: dateFromFilter,
          dateTo: dateToFilter,
        },
      ]) as {
        tickets?: Array<{ _id: string; companyId: string; imageUrl?: string | null }>;
      } | undefined;

      const listTicket = ticketsData?.data?.find(
        (row) => row._id === selectedImage.ticketId && row.companyId === companyId,
      );
      const dailyTicket = dailyData?.tickets?.find(
        (row) => row._id === selectedImage.ticketId && row.companyId === companyId,
      );
      const freshUrl = selectTicketImageUrl(companyId, selectedImage.ticketId, null, {
        ticketId: selectedImage.ticketId,
        companyId,
        imageUrl: mergeTicketImageUrl(listTicket, dailyTicket),
      });

      if (freshUrl && freshUrl !== selectedImage.imageUrl) {
        setSelectedImage((current) =>
          current && current.ticketId === selectedImage.ticketId
            ? { ...current, imageUrl: freshUrl }
            : current,
        );
        imageRetryCountRef.current = 0;
      }
    } finally {
      setIsImageRetrying(false);
    }
  };

  const handleStartTableEditing = (ticketIds: string[]) => {
    if (!companyId) return;
    const editableRows = ticketIds.flatMap((ticketId) => {
      const ticket = backendTicketById.get(ticketId);
      return ticket && ticket.companyId === companyId
        ? [{ id: ticketId, companyId, ticket }]
        : [];
    });
    if (editableRows.length === 0) {
      toast.error('No fue posible preparar los tickets visibles para edición.');
      return;
    }
    tableEditing.startEditing(editableRows, companyId);
  };

  const handleCancelTableEditing = () => {
    if (tableEditing.dirtyTicketIds.length > 0) {
      setShowCancelConfirmation(true);
      return;
    }
    tableEditing.cancelEditing();
  };

  const handleSaveTableEditing = async () => {
    if (savingClaimRef.current || isSavingTable) return;
    const originCompanyId = tableEditing.editingCompanyId;
    if (!originCompanyId || originCompanyId !== companyId) {
      tableEditing.cancelEditing();
      toast.error('La edición ya no pertenece a la compañía activa.');
      return;
    }
    if (Object.keys(tableEditing.validationErrors).length > 0) {
      toast.error('Revisa los datos marcados antes de guardar.');
      return;
    }
    if (tableEditing.dirtyTicketIds.length === 0) {
      toast.info('No hay cambios para guardar.');
      return;
    }

    savingClaimRef.current = true;
    setIsSavingTable(true);
    const dirtyIds = [...tableEditing.dirtyTicketIds];

    try {
      const { savedIds, errors } = await saveHistoryTicketDrafts({
        ticketIds: dirtyIds,
        baselines: tableEditing.baselines,
        drafts: tableEditing.drafts,
        save: async (ticketId, payload) => {
          await updateMutation.mutateAsync({
            companyId: originCompanyId,
            ticketId,
            payload,
          });
        },
      });

      if (isAuthSessionClosing() || companyIdRef.current !== originCompanyId) return;
      tableEditing.applySaveResults(savedIds, errors);
      if (Object.keys(errors).length > 0) {
        toast.error('Algunos tickets no pudieron guardarse. Revisa las filas marcadas.');
      } else {
        toast.success('Cambios guardados.');
      }
    } finally {
      savingClaimRef.current = false;
      setIsSavingTable(false);
    }
  };

  const handleDelete = (ticketId: string) => {
    if (!companyId || deleteMutation.isPending || tableEditing.isTableEditing) return;
    deleteMutation.mutate({ ticketId, originCompanyId: companyId });
  };

  const kpiUnavailableLabel = (() => {
    switch (financialKpis.availability) {
      case 'invalid-range':
        return 'Rango inválido';
      case 'category-unsupported':
        return 'No disponible';
      case 'error':
        return 'No disponible';
      default:
        return 'No disponible';
    }
  })();

  const kpiUnavailableHint = (() => {
    switch (financialKpis.availability) {
      case 'invalid-range':
        return 'La fecha inicial no puede ser posterior a la final.';
      case 'category-unsupported':
        return 'El backend aún no agrega métricas por categoría.';
      case 'error':
        return 'No fue posible cargar esta métrica.';
      case 'empty':
        return financialKpis.periodLabel === 'Selecciona un período'
          ? 'Usa un preset o selecciona un rango de fechas.'
          : 'Período sin movimientos.';
      default:
        return 'No fue posible cargar esta métrica.';
    }
  })();

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de tickets</h1>
          <p className="text-muted-foreground mt-1">Todos tus comprobantes organizados y clasificados</p>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">Métricas del período</h2>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Información sobre las métricas"
                >
                  <Info size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 text-sm leading-relaxed">
                Las métricas se calculan según la compañía, el período y la categoría seleccionados.
                La búsqueda por texto no modifica estos indicadores.
              </PopoverContent>
            </Popover>
          </div>

          {financialKpis.availability === 'loading' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
            </div>
          ) : financialKpis.income && financialKpis.expense && financialKpis.balance && financialKpis.paymentMethod ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Ingresos totales"
                value={financialKpis.income.value}
                icon={<ArrowUpCircle size={20} />}
              />
              <MetricCard
                title="Egresos totales"
                value={financialKpis.expense.value}
                icon={<ArrowDownCircle size={20} />}
              />
              <MetricCard
                title="Saldo neto"
                value={financialKpis.balance.value}
                icon={<Scale size={20} />}
              />
              <MetricCard
                title="Método más usado"
                value={financialKpis.paymentMethod.title}
                icon={<CreditCard size={20} />}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(
                [
                  { title: 'Ingresos totales', icon: <ArrowUpCircle size={20} /> },
                  { title: 'Egresos totales', icon: <ArrowDownCircle size={20} /> },
                  { title: 'Saldo neto', icon: <Scale size={20} /> },
                  { title: 'Método más usado', icon: <CreditCard size={20} /> },
                ] as const
              ).map((card) => (
                <MetricCard
                  key={card.title}
                  title={card.title}
                  value={kpiUnavailableLabel}
                  subtitle={kpiUnavailableHint}
                  icon={card.icon}
                />
              ))}
            </div>
          )}

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
                  disabled={tableEditing.isTableEditing}
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
                />
                {globalFilter && (
                  <button
                    type="button"
                    disabled={tableEditing.isTableEditing}
                    onClick={() => setGlobalFilter('')}
                  >
                    <X size={14} className="text-muted-foreground" />
                  </button>
                )}
              </div>
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                disabled={tableEditing.isTableEditing}
              >
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
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
                disabled={tableEditing.isTableEditing}
              >
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2" aria-label="Rangos rápidos de fecha">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={activePreset === preset.id ? 'default' : 'outline'}
                    className="rounded-xl min-h-9"
                    onClick={() => applyDatePreset(preset.id)}
                    disabled={tableEditing.isTableEditing}
                    aria-pressed={activePreset === preset.id}
                  >
                    {preset.label}
                  </Button>
                ))}
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
                    disabled={tableEditing.isTableEditing}
                    className={cn(
                      'h-10 rounded-xl border-border',
                      dateRangeInvalid && 'border-destructive',
                    )}
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
                    disabled={tableEditing.isTableEditing}
                    className={cn(
                      'h-10 rounded-xl border-border',
                      dateRangeInvalid && 'border-destructive',
                    )}
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
                    disabled={tableEditing.isTableEditing}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
              {dateRangeInvalid && (
                <p className="text-xs text-destructive">
                  La fecha inicial no puede ser posterior a la fecha final.
                </p>
              )}
              {tableEditing.isTableEditing && (
                <p className="text-xs text-muted-foreground">
                  Guarda o cancela los cambios para modificar los filtros.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <HistoryTicketTable
          tickets={filteredData}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          isLoading={ticketsQuery.isPending}
          isError={ticketsQuery.isError}
          onRetry={() => {
            void ticketsQuery.refetch();
          }}
          isEditing={tableEditing.isTableEditing}
          isSaving={isSavingTable}
          drafts={tableEditing.drafts}
          dirtyTicketIds={tableEditing.dirtyTicketIds}
          validationErrors={tableEditing.validationErrors}
          rowErrors={tableEditing.rowErrors}
          deletingTicketId={deletingTicketId}
          onStartEditing={handleStartTableEditing}
          onUpdateDraft={tableEditing.updateDraftPatch}
          onSave={() => {
            void handleSaveTableEditing();
          }}
          onCancel={handleCancelTableEditing}
          onPreviewImage={handlePreviewImage}
          onDelete={handleDelete}
          onClearFilters={handleClearFilters}
        />
      </div>

      <TicketImageDialog
        open={Boolean(
          selectedImage &&
            selectedImage.companyId === companyId,
        )}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedImage(null);
            imageRetryCountRef.current = 0;
          }
        }}
        imageUrl={
          selectedImage?.companyId === companyId
            ? selectedImage.imageUrl
            : null
        }
        alt={selectedImage?.alt ?? 'Imagen del ticket'}
        title={selectedImage?.alt ?? 'Imagen del ticket'}
        onRetry={() => {
          void handleImageRetry();
        }}
        isRetrying={isImageRetrying}
      />

      <AlertDialog open={showCancelConfirmation} onOpenChange={setShowCancelConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Los valores editados volverán a su estado original. No se enviará ninguna solicitud.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                tableEditing.cancelEditing();
                setShowCancelConfirmation(false);
              }}
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
