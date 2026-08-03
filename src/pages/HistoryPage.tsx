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
  type HistoryEditableField,
} from '@/hooks/use-history-table-editing';
import { useFinancialKpis } from '@/hooks/use-financial-kpis';
import { useAuth } from '@/hooks/use-auth';
import { useCompanies } from '@/hooks/use-companies';
import { isAuthSessionClosing } from '@/auth/session-cleanup';
import { deleteTicket } from '@/services/tickets.service';
import {
  DATE_PRESETS,
  dateRangeForPreset,
  detectActivePreset,
  formatMxn,
  isValidDateRange,
  last12MonthsRange,
  resolveCompanyTimeZone,
  type DatePresetId,
} from '@/utils/financial-kpis';
import {
  formatCivilDateDisplay,
  parseCivilDateInput,
} from '@/utils/civil-date-input';
import {
  ticketCompanyQueryKey,
  ticketListQueryKey,
} from '@/utils/ticket-queries';
import {
  invalidateTicketDerivedQueries,
  ticketUpdateAffectsFinancialKpis,
} from '@/utils/ticket-derived-queries';
import {
  buildHistoryTicketUpdatePayload,
  type HistoryTicketEditDraft,
} from '@/utils/ticket-edit';
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
  const [dateFromDisplay, setDateFromDisplay] = useState(() =>
    formatCivilDateDisplay(initialDateRange.dateFrom),
  );
  const [dateToDisplay, setDateToDisplay] = useState(() =>
    formatCivilDateDisplay(initialDateRange.dateTo),
  );
  const [isSavingTable, setIsSavingTable] = useState(false);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [savingAccreditableIds, setSavingAccreditableIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isImageRetrying, setIsImageRetrying] = useState(false);

  const { companyId } = useAuth();
  const { activeCompany } = useCompanies();
  const companyTimeZone = resolveCompanyTimeZone(activeCompany?.timezone);
  const queryClient = useQueryClient();
  const companyIdRef = useRef(companyId);
  const previousCompanyIdRef = useRef(companyId);
  const savingClaimRef = useRef(false);
  const savingAccreditableRef = useRef<Set<string>>(new Set());
  const imageRetryCountRef = useRef(0);
  const tableEditing = useHistoryTableEditing();
  const { cancelEditing, isEditing } = tableEditing;
  companyIdRef.current = companyId;

  // P0 multitenant: una imagen nunca sobrevive al cambio de compañía.
  useEffect(() => {
    if (previousCompanyIdRef.current !== companyId) {
      setSelectedImage(null);
      imageRetryCountRef.current = 0;
      savingAccreditableRef.current = new Set();
      setSavingAccreditableIds(new Set());
      if (previousCompanyIdRef.current && isEditing) {
        cancelEditing();
        if (companyId && !isAuthSessionClosing()) {
          toast.info('La edición se canceló al cambiar de compañía.');
        }
      }
    }
    previousCompanyIdRef.current = companyId;
  }, [cancelEditing, companyId, isEditing]);

  // Mantener displays alineados cuando el wire cambia por presets / limpiar.
  useEffect(() => {
    setDateFromDisplay(dateFromFilter ? formatCivilDateDisplay(dateFromFilter) : '');
    setDateToDisplay(dateToFilter ? formatCivilDateDisplay(dateToFilter) : '');
  }, [dateFromFilter, dateToFilter]);

  const dateRangeInvalid = !isValidDateRange(dateFromFilter, dateToFilter);

  const effectiveDateRange = useMemo(
    () => ({
      dateFrom: dateFromFilter.trim(),
      dateTo: dateToFilter.trim(),
    }),
    [dateFromFilter, dateToFilter],
  );

  const lastValidListParamsRef = useRef<{
    page: number;
    limit: number;
    dateFrom?: string;
    dateTo?: string;
  }>({
    page: 1,
    limit: 100,
    dateFrom: initialDateRange.dateFrom,
    dateTo: initialDateRange.dateTo,
  });

  const ticketsListParams = useMemo(() => {
    if (dateRangeInvalid) return lastValidListParamsRef.current;
    const params: { page: number; limit: number; dateFrom?: string; dateTo?: string } = {
      page: 1,
      limit: 100,
    };
    if (effectiveDateRange.dateFrom) params.dateFrom = effectiveDateRange.dateFrom;
    if (effectiveDateRange.dateTo) params.dateTo = effectiveDateRange.dateTo;
    lastValidListParamsRef.current = params;
    return params;
  }, [effectiveDateRange, dateRangeInvalid]);

  const ticketsQuery = useTickets(ticketsListParams);
  const dailyReportQuery = useDashboardDailyReport(ticketsListParams);
  const updateMutation = useUpdateDashboardTicket();

  const financialKpis = useFinancialKpis({
    dateFrom: ticketsListParams.dateFrom ?? '',
    dateTo: ticketsListParams.dateTo ?? '',
    category: categoryFilter,
  });
  const activePreset = detectActivePreset(
    effectiveDateRange.dateFrom,
    effectiveDateRange.dateTo,
    periodReference,
    companyTimeZone,
  );
  const hasDateFilter = Boolean(
    effectiveDateRange.dateFrom || effectiveDateRange.dateTo,
  );

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
        isAccreditable: ticket.isAccreditable ?? dailyTicket.isAccreditable ?? true,
      };
    });
  }, [dailyReportQuery.data?.tickets, ticketsQuery.data?.data]);
  const tickets = useMemo(
    () => mapBackendTickets(backendTickets, companyTimeZone),
    [backendTickets, companyTimeZone],
  );
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
    // Las fechas las aplica el servidor (dateFrom/dateTo). No refiltrar en cliente.
    return data;
  }, [tickets, categoryFilter, statusFilter]);

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
    if (activePreset === preset) return;
    const range = dateRangeForPreset(preset, periodReference, companyTimeZone);
    setDateFromFilter(range.dateFrom);
    setDateToFilter(range.dateTo);
  };

  const commitDateFromDisplay = () => {
    const raw = dateFromDisplay.trim();
    if (!raw) {
      setDateFromFilter('');
      setDateFromDisplay('');
      return;
    }
    const wire = parseCivilDateInput(raw);
    if (!wire) {
      setDateFromDisplay(dateFromFilter ? formatCivilDateDisplay(dateFromFilter) : '');
      toast.error('Ingresa una fecha válida con el formato DD/MM/AAAA.');
      return;
    }
    setDateFromFilter(wire);
    setDateFromDisplay(formatCivilDateDisplay(wire));
  };

  const commitDateToDisplay = () => {
    const raw = dateToDisplay.trim();
    if (!raw) {
      setDateToFilter('');
      setDateToDisplay('');
      return;
    }
    const wire = parseCivilDateInput(raw);
    if (!wire) {
      setDateToDisplay(dateToFilter ? formatCivilDateDisplay(dateToFilter) : '');
      toast.error('Ingresa una fecha válida con el formato DD/MM/AAAA.');
      return;
    }
    setDateToFilter(wire);
    setDateToDisplay(formatCivilDateDisplay(wire));
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
      await invalidateTicketDerivedQueries(queryClient, originCompanyId, {
        tickets: true,
        dailyReport: true,
        financialKpis: true,
      });
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
        queryClient.refetchQueries({ queryKey: ticketCompanyQueryKey(companyId) }),
        queryClient.refetchQueries({ queryKey: ['dashboard-daily-report', companyId] }),
      ]);

      const ticketsData = queryClient.getQueryData(
        ticketListQueryKey(companyId, ticketsListParams),
      ) as {
        data?: Array<{ _id: string; companyId: string; imageUrl?: string | null }>;
      } | undefined;
      const dailyData = queryClient.getQueryData([
        'dashboard-daily-report',
        companyId,
        ticketsListParams,
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

  type CommitActiveCellResult =
    | 'idle'
    | 'unchanged'
    | 'committed'
    | 'invalid'
    | 'error'
    | 'busy';

  const commitActiveCell = async (
    draftOverride?: Partial<HistoryTicketEditDraft>,
  ): Promise<CommitActiveCellResult> => {
    if (savingClaimRef.current || isSavingTable) return 'busy';
    if (!tableEditing.editingCell) return 'idle';

    const originCompanyId = tableEditing.editingCompanyId;
    const activeTicketId = tableEditing.editingCell.ticketId;
    if (!originCompanyId || originCompanyId !== companyId || !activeTicketId) {
      tableEditing.cancelEditing();
      toast.error('La edición ya no pertenece a la compañía activa.');
      return 'error';
    }

    const baseline = tableEditing.baselines[activeTicketId];
    const currentDraft = tableEditing.drafts[activeTicketId];
    if (!baseline || !currentDraft) {
      tableEditing.cancelEditing();
      return 'idle';
    }

    const draft = draftOverride
      ? { ...currentDraft, ...draftOverride }
      : currentDraft;

    if (draftOverride) {
      tableEditing.updateDraftPatch(activeTicketId, draftOverride);
    }

    const built = buildHistoryTicketUpdatePayload(baseline, draft);
    if (built.ok === false) {
      if (built.reason === 'validation') {
        toast.error(built.message);
        return 'invalid';
      }
      tableEditing.cancelEditing();
      return 'unchanged';
    }

    savingClaimRef.current = true;
    setIsSavingTable(true);
    const shouldRefreshKpis = ticketUpdateAffectsFinancialKpis(built.payload);

    try {
      const { savedIds, errors } = await saveHistoryTicketDrafts({
        ticketIds: [activeTicketId],
        baselines: { [activeTicketId]: baseline },
        drafts: { [activeTicketId]: draft },
        save: async (ticketId, payload) => {
          await updateMutation.mutateAsync({
            companyId: originCompanyId,
            ticketId,
            payload,
          });
        },
      });

      if (isAuthSessionClosing()) return 'error';

      if (shouldRefreshKpis && savedIds.includes(activeTicketId)) {
        await invalidateTicketDerivedQueries(queryClient, originCompanyId, {
          financialKpis: true,
        });
      }

      if (companyIdRef.current !== originCompanyId) return 'error';

      tableEditing.applySaveResults(savedIds, errors);
      if (Object.keys(errors).length > 0) {
        toast.error('No fue posible guardar este ticket. Revisa los datos e inténtalo nuevamente.');
        return 'error';
      }
      toast.success('Cambio guardado.');
      return 'committed';
    } finally {
      savingClaimRef.current = false;
      setIsSavingTable(false);
    }
  };

  const handleEditCell = async (ticket: UiTicket, field: HistoryEditableField) => {
    if (!companyId || isSavingTable || savingClaimRef.current) return;
    const backendTicket = backendTicketById.get(ticket.id);
    if (!backendTicket || backendTicket.companyId !== companyId) {
      toast.error('No fue posible preparar este ticket para edición.');
      return;
    }

    const row = { id: ticket.id, companyId, ticket: backendTicket };
    let result = tableEditing.requestCellEdit(row, field, companyId, companyTimeZone);

    if (result === 'needs-commit') {
      const commitResult = await commitActiveCell();
      if (
        commitResult === 'invalid' ||
        commitResult === 'error' ||
        commitResult === 'busy'
      ) {
        return;
      }
      result = tableEditing.requestCellEdit(row, field, companyId, companyTimeZone);
    }

    if (result === 'ignored') {
      toast.error('No fue posible preparar este ticket para edición.');
    }
  };

  const handleCancelTableEditing = () => {
    if (isSavingTable || savingClaimRef.current) return;
    tableEditing.cancelEditing();
  };

  const handleDelete = (ticketId: string) => {
    if (!companyId || deleteMutation.isPending || tableEditing.isEditing) return;
    deleteMutation.mutate({ ticketId, originCompanyId: companyId });
  };

  const handleToggleAccreditable = async (ticket: UiTicket, nextValue: boolean) => {
    const originCompanyId = companyId;
    const ticketId = ticket.id;
    if (!originCompanyId || tableEditing.isEditing) return;
    if (savingAccreditableRef.current.has(ticketId)) return;
    if (ticket.isAccreditable === nextValue) return;

    savingAccreditableRef.current.add(ticketId);
    setSavingAccreditableIds(new Set(savingAccreditableRef.current));

    try {
      const updated = await updateMutation.mutateAsync({
        companyId: originCompanyId,
        ticketId,
        payload: { isAccreditable: nextValue },
      });
      if (isAuthSessionClosing() || companyIdRef.current !== originCompanyId) return;

      const confirmed =
        typeof updated?.isAccreditable === 'boolean' ? updated.isAccreditable : nextValue;

      // Patch both History sources immediately so a slower daily-report refetch
      // cannot flash the previous value (tickets list is the merge priority).
      queryClient.setQueriesData(
        { queryKey: ticketCompanyQueryKey(originCompanyId) },
        (current: unknown) => {
          if (!current || typeof current !== 'object') return current;
          const page = current as { data?: Array<{ _id: string; isAccreditable?: boolean }> };
          if (!Array.isArray(page.data)) return current;
          return {
            ...page,
            data: page.data.map((row) =>
              row._id === ticketId ? { ...row, isAccreditable: confirmed } : row,
            ),
          };
        },
      );
      queryClient.setQueriesData(
        { queryKey: ['dashboard-daily-report', originCompanyId] },
        (current: unknown) => {
          if (!current || typeof current !== 'object') return current;
          const report = current as {
            tickets?: Array<{ _id: string; isAccreditable?: boolean }>;
          };
          if (!Array.isArray(report.tickets)) return current;
          return {
            ...report,
            tickets: report.tickets.map((row) =>
              row._id === ticketId ? { ...row, isAccreditable: confirmed } : row,
            ),
          };
        },
      );
    } catch {
      if (isAuthSessionClosing() || companyIdRef.current !== originCompanyId) return;
      toast.error('No se pudo actualizar si el ticket es acreditable.');
    } finally {
      savingAccreditableRef.current.delete(ticketId);
      if (!isAuthSessionClosing()) {
        setSavingAccreditableIds(new Set(savingAccreditableRef.current));
      }
    }
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
        return 'Período sin movimientos.';
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
                  disabled={tableEditing.isEditing}
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
                />
                {globalFilter && (
                  <button
                    type="button"
                    disabled={tableEditing.isEditing}
                    onClick={() => setGlobalFilter('')}
                  >
                    <X size={14} className="text-muted-foreground" />
                  </button>
                )}
              </div>
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                    disabled={tableEditing.isEditing}
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
                    disabled={tableEditing.isEditing}
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
                    disabled={tableEditing.isEditing}
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
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/AAAA"
                    value={dateFromDisplay}
                    onChange={(e) => setDateFromDisplay(e.target.value)}
                    onBlur={commitDateFromDisplay}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitDateFromDisplay();
                      }
                    }}
                    disabled={tableEditing.isEditing}
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
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/AAAA"
                    value={dateToDisplay}
                    onChange={(e) => setDateToDisplay(e.target.value)}
                    onBlur={commitDateToDisplay}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitDateToDisplay();
                      }
                    }}
                    disabled={tableEditing.isEditing}
                    className={cn(
                      'h-10 rounded-xl border-border',
                      dateRangeInvalid && 'border-destructive',
                    )}
                  />
                </div>
              </div>
              {dateRangeInvalid && (
                <p className="text-xs text-destructive">
                  La fecha inicial no puede ser posterior a la fecha final.
                </p>
              )}
              {tableEditing.isEditing && (
                <p className="text-xs text-muted-foreground">
                  Termina la celda activa (Enter o clic fuera) o cancela con Escape para modificar los filtros.
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
          isSaving={isSavingTable}
          drafts={tableEditing.drafts}
          dirtyTicketIds={tableEditing.dirtyTicketIds}
          validationErrors={tableEditing.validationErrors}
          rowErrors={tableEditing.rowErrors}
          deletingTicketId={deletingTicketId}
          editingTicketId={tableEditing.editingCell?.ticketId ?? null}
          editingField={tableEditing.editingCell?.field ?? null}
          onEditCell={(ticket, field) => {
            void handleEditCell(ticket, field);
          }}
          onUpdateDraft={tableEditing.updateDraftPatch}
          onSave={(patch) => {
            void commitActiveCell(patch);
          }}
          onCancel={handleCancelTableEditing}
          onPreviewImage={handlePreviewImage}
          onDelete={handleDelete}
          onClearFilters={handleClearFilters}
          onToggleAccreditable={(ticket, nextValue) => {
            void handleToggleAccreditable(ticket, nextValue);
          }}
          savingAccreditableIds={savingAccreditableIds}
          emptyTitle={
            !hasDateFilter &&
            categoryFilter === 'all' &&
            statusFilter === 'all' &&
            !globalFilter.trim()
              ? 'No hay tickets registrados'
              : 'No hay tickets para estos filtros.'
          }
          emptyDescription={
            !hasDateFilter
              ? categoryFilter !== 'all' || statusFilter !== 'all' || globalFilter.trim()
                ? 'Prueba otra categoría, estatus o búsqueda.'
                : 'Aún no hay tickets cargados para esta compañía.'
              : 'Prueba otro rango de fechas, categoría o búsqueda.'
          }
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
    </AppLayout>
  );
}
