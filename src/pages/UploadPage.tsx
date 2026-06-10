import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import { TicketNotes } from '@/components/recify/TicketNotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePreprocessTicket, useUploadTicket } from '@/hooks/use-upload-ticket';
import { useUpdateDashboardTicket } from '@/hooks/use-tickets';
import { mapBackendTicket, mapPreprocessTicket } from '@/mappers/ticket.mapper';
import {
  applyDraftToUiTicket,
  buildTicketUpdatePayload,
  createDraftFromAnalyzedTicket,
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
import { Upload, Camera, FileImage, Loader2, CheckCircle2, Edit3, Save, Plus, Receipt, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/api/http';

type UploadState = 'idle' | 'uploaded' | 'analyzing' | 'done';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const PAYMENT_OPTIONS: { value: BackendPaymentMethod; label: string }[] = [
  { value: 'card', label: 'Tarjeta de crédito' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

const STATUS_OPTIONS: { value: BackendTicketStatus; label: string }[] = [
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
  { value: 'egreso', label: 'Egreso' },
];

export default function UploadPage() {
  const [state, setState] = useState<UploadState>('idle');
  const [ticket, setTicket] = useState<UiTicket | null>(null);
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [editBaseline, setEditBaseline] = useState<TicketEditDraft | null>(null);
  const [draft, setDraft] = useState<TicketEditDraft | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { token, companyId } = useAuth();
  const preprocessMutation = usePreprocessTicket();
  const uploadMutation = useUploadTicket();
  const updateMutation = useUpdateDashboardTicket();

  const isBusy = preprocessMutation.isPending || uploadMutation.isPending || updateMutation.isPending;
  const editValidationMessage = useMemo(() => getTicketEditValidationMessage(draft), [draft]);
  const hasEditChanges = useMemo(() => hasTicketEditChanges(editBaseline, draft), [editBaseline, draft]);
  const canSaveEdit = Boolean(draft && editBaseline && hasEditChanges && !editValidationMessage);
  const editing = Boolean(draft);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const formatMXN = useCallback(
    (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    [],
  );

  const extractError = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  const validateSession = () => {
    if (!token) {
      toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
      return false;
    }
    if (!companyId) {
      toast.error('No hay una compañía activa para procesar el ticket.');
      return false;
    }
    return true;
  };

  const validateFile = (file: File | null | undefined) => {
    if (!file) {
      toast.error('Selecciona un archivo para continuar.');
      return false;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('El archivo supera el máximo de 10 MB.');
      return false;
    }
    return true;
  };

  const runPreprocess = async (file: File, imageUrlOverride?: string) => {
    if (!validateSession()) return;
    setState('analyzing');
    try {
      const response = await preprocessMutation.mutateAsync({ file });
      const mapped = mapPreprocessTicket(response.ticket, {
        imageUrl: imageUrlOverride ?? previewUrl,
        fallbackId: `preview-${Date.now()}`,
        ocrText: response.ocrText,
      });
      const nextBaseline = createDraftFromAnalyzedTicket(response.ticket, mapped);
      setTicket(mapped);
      setAnalysisRaw(response.ticket);
      setEditBaseline(nextBaseline);
      setDraft(null);
      setState('done');
      toast.success('Ticket analizado correctamente.');
    } catch (err) {
      setState('uploaded');
      toast.error(extractError(err, 'No se pudo analizar el ticket.'));
    }
  };

  const handleNewFile = async (file: File | null) => {
    if (isBusy) return;
    if (!validateSession()) return;
    if (!validateFile(file)) return;

    const nextFile = file as File;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(nextFile);

    setPreviewUrl(nextPreview);
    setSelectedFile(nextFile);
    setTicket(null);
    setAnalysisRaw(null);
    setEditBaseline(null);
    setDraft(null);
    setState('uploaded');

    await runPreprocess(nextFile, nextPreview);
  };

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
      else if (e.type === 'dragleave') setDragActive(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isBusy) return;
      setDragActive(false);
      const file = e.dataTransfer.files?.[0] ?? null;
      void handleNewFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBusy],
  );

  const openFilePicker = () => {
    if (isBusy) return;
    if (!validateSession()) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    await handleNewFile(file);
    e.currentTarget.value = '';
  };

  const handleSave = async () => {
    if (isBusy) return;
    if (!validateSession()) return;
    if (!validateFile(selectedFile)) return;

    try {
      const response = await uploadMutation.mutateAsync({ file: selectedFile as File });
      let persistedTicket = response.ticket;
      let mapped = mapBackendTicket(persistedTicket);
      const intendedDraft = editBaseline;

      if (intendedDraft) {
        const result = buildTicketUpdatePayload(createDraftFromTicket(persistedTicket), intendedDraft);
        if (result.ok) {
          persistedTicket = await updateMutation.mutateAsync({
            ticketId: persistedTicket._id,
            payload: result.payload,
          });
          mapped = mapBackendTicket(persistedTicket);
        }
      }

      const nextTicket = {
        ...mapped,
        imagenUrl: mapped.imagenUrl ?? response.imageUrl ?? previewUrl,
      };
      setTicket(nextTicket);
      setAnalysisRaw(persistedTicket);
      const nextBaseline = createDraftFromTicket(persistedTicket);
      setEditBaseline(nextBaseline);
      setDraft(null);
      setState('done');
      toast.success('Ticket guardado correctamente.');
    } catch (err) {
      toast.error(extractError(err, 'No se pudo guardar el ticket.'));
    }
  };

  const handleReanalyze = async () => {
    if (!selectedFile) {
      toast.error('Primero selecciona una imagen.');
      return;
    }
    await runPreprocess(selectedFile);
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setState('idle');
    setTicket(null);
    setAnalysisRaw(null);
    setEditBaseline(null);
    setDraft(null);
    setSelectedFile(null);
    setPreviewUrl(undefined);
    preprocessMutation.reset();
    uploadMutation.reset();
  };

  const ticketFields = useMemo(
    () =>
      ticket
        ? [
            { label: 'Comercio', value: ticket.comercio, key: 'comercio' },
            { label: 'Fecha', value: ticket.fecha, key: 'fecha' },
            { label: 'Hora', value: ticket.hora, key: 'hora' },
            { label: 'Subtotal', value: formatMXN(ticket.subtotal), key: 'subtotal' },
            { label: 'IVA', value: formatMXN(ticket.iva), key: 'iva' },
            { label: 'Total', value: formatMXN(ticket.total), key: 'total' },
            { label: 'Moneda', value: ticket.moneda, key: 'moneda' },
            { label: 'Método de pago', value: ticket.metodoPago, key: 'metodoPago' },
          ]
        : [],
    [ticket, formatMXN],
  );

  const handleStartEdit = () => {
    if (!ticket || !editBaseline) return;
    setDraft(editBaseline);
  };

  const handleCancelEdit = () => {
    setDraft(null);
  };

  const updateDraft = <K extends keyof TicketEditDraft>(key: K, value: TicketEditDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleApplyEdit = () => {
    if (!ticket || !editBaseline || !draft) return;

    const result = buildTicketUpdatePayload(editBaseline, draft);
    if (!result.ok) {
      if (result.reason === 'no-changes') {
        toast.info('No hay cambios para guardar.');
        return;
      }
      toast.error(result.message);
      return;
    }

    const normalizedDraft = normalizeTicketEditDraft(draft);
    setTicket(applyDraftToUiTicket(ticket, normalizedDraft));
    setEditBaseline(normalizedDraft);
    setDraft(normalizedDraft);
    toast.success('Cambios aplicados al análisis.');
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subir ticket</h1>
          <p className="text-muted-foreground mt-1">
            Captura o sube una imagen de tu ticket para analizarlo
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload zone */}
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={state === 'idle' ? openFilePicker : undefined}
              className={`relative bg-card border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-[340px] transition-all ${
                state === 'idle' ? 'cursor-pointer' : ''
              } ${
                dragActive
                  ? 'border-primary bg-accent'
                  : state === 'idle'
                  ? 'border-border hover:border-primary/50 hover:bg-accent/30'
                  : 'border-border'
              }`}
            >
              {state === 'idle' && (
                <div className="text-center space-y-4">
                  <div className="p-4 rounded-2xl bg-accent text-accent-foreground mx-auto w-fit">
                    <Upload size={32} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Arrastra tu ticket aquí</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      o haz clic para seleccionar archivo
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WEBP o GIF hasta 10 MB</p>
                </div>
              )}

              {state === 'uploaded' && (
                <div className="text-center space-y-3 animate-fade-in">
                  <FileImage size={48} className="text-primary mx-auto" />
                  <p className="text-sm font-medium text-foreground">
                    {selectedFile?.name ?? 'ticket.jpg'}
                  </p>
                  <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                </div>
              )}

              {state === 'analyzing' && (
                <div className="text-center space-y-4 animate-fade-in">
                  <div className="relative">
                    <FileImage size={48} className="text-muted-foreground mx-auto opacity-50" />
                    <Loader2
                      size={24}
                      className="absolute -bottom-1 text-primary animate-spin mx-auto"
                      style={{ left: '50%', transform: 'translateX(8px)' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Analizando ticket...</p>
                    <p className="text-sm text-muted-foreground mt-1">Extrayendo información con IA</p>
                  </div>
                  <div className="w-48 mx-auto">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full animate-shimmer"
                        style={{
                          width: '70%',
                          backgroundSize: '200% 100%',
                          backgroundImage:
                            'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.5) 50%, hsl(var(--primary)) 100%)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {state === 'done' && (
                <div className="text-center space-y-3 animate-scale-in">
                  <div className="p-3 rounded-full bg-accent text-success mx-auto w-fit">
                    <CheckCircle2 size={32} />
                  </div>
                  <p className="font-medium text-foreground">Ticket analizado correctamente</p>
                  <p className="text-sm text-muted-foreground">Información extraída con éxito</p>
                </div>
              )}
            </div>

            {state === 'idle' && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                  onClick={openFilePicker}
                  disabled={isBusy}
                >
                  <Camera size={16} className="mr-2" /> Tomar foto
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                  onClick={openFilePicker}
                  disabled={isBusy}
                >
                  <Upload size={16} className="mr-2" /> Subir archivo
                </Button>
              </div>
            )}

            {state === 'done' && (
              <Button
                onClick={handleReanalyze}
                className="w-full h-11 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
                disabled={isBusy}
              >
                {preprocessMutation.isPending ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : null}
                Analizar de nuevo
              </Button>
            )}
          </div>

          {/* Results panel */}
          <div className="space-y-4">
            {state === 'analyzing' && (
              <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-elegant space-y-4 animate-fade-in">
                <Skeleton className="h-5 w-32" />
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {state === 'done' && ticket && (
              <>
                {/* Imagen del ticket */}
                <TicketImagePreview
                  imageUrl={ticket.imagenUrl}
                  alt={`Ticket de ${ticket.comercio}`}
                />

                {/* Summary mini card */}
                <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-elegant animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground">Resumen</h3>
                    <StatusBadge status={ticket.estatus} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total detectado</p>
                      <p className="text-xl font-bold text-foreground">{formatMXN(ticket.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comercio</p>
                      <p className="text-sm font-medium text-foreground">{ticket.comercio}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha</p>
                      <p className="text-sm text-foreground">{ticket.fecha}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Categoría</p>
                      <CategoryBadge category={ticket.categoria} />
                    </div>
                  </div>
                </div>

                {/* Detail fields */}
                <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-elegant animate-slide-in-right">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-foreground">Información extraída</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-lg"
                      onClick={handleStartEdit}
                      disabled={!editBaseline || isBusy}
                      aria-label="Editar análisis del ticket"
                    >
                      <Edit3 size={14} className="mr-1.5" /> Editar
                    </Button>
                  </div>

                  {editing && draft ? (
                    <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Tipo</Label>
                          <Select value={draft.type} onValueChange={(v) => updateDraft('type', v as BackendTicketType)}>
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
                          <Select value={draft.status} onValueChange={(v) => updateDraft('status', v as BackendTicketStatus)}>
                            <SelectTrigger className="h-9 rounded-lg text-sm bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
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
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button
                          className="flex-1 h-10 rounded-xl bg-gradient-primary text-primary-foreground transition-all hover:shadow-md hover:ring-2 hover:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none disabled:hover:ring-0"
                          onClick={handleApplyEdit}
                          disabled={isBusy || !canSaveEdit}
                        >
                          {isBusy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
                          {isBusy ? 'Guardando...' : canSaveEdit ? 'Guardar cambios' : 'Sin cambios'}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 rounded-xl"
                          onClick={handleCancelEdit}
                          disabled={isBusy}
                        >
                          <XCircle size={14} className="mr-2" /> Cancelar
                        </Button>
                      </div>

                      {editValidationMessage ? (
                        <p className="text-xs text-destructive">{editValidationMessage}</p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ticketFields.map((field) => (
                          <div key={field.key} className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">{field.label}</p>
                            <p className="text-sm font-medium text-foreground">{field.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <TicketNotes title="Notas" sources={[analysisRaw, ticket]} />
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1 h-11 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
                    onClick={handleSave}
                    disabled={isBusy || editing}
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    Guardar ticket
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-11 rounded-xl"
                    onClick={reset}
                    disabled={isBusy}
                  >
                    <Plus size={16} className="mr-2" /> Subir otro
                  </Button>
                </div>
              </>
            )}

            {state === 'idle' && (
              <div className="bg-card rounded-2xl border border-border/50 p-8 shadow-elegant flex flex-col items-center justify-center min-h-[340px] text-center">
                <div className="p-4 rounded-2xl bg-accent text-accent-foreground mb-4">
                  <Receipt size={32} />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Sin ticket cargado</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Sube una foto o imagen de un ticket para que nuestra IA extraiga la información
                  automáticamente
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
