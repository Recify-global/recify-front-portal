import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import { TicketImageDialog } from '@/components/recify/TicketImageDialog';
import { CameraCaptureDialog } from '@/components/recify/CameraCaptureDialog';
import { BatchUploadDialog } from '@/components/recify/BatchUploadDialog';
import { TicketScanAnimation } from '@/components/recify/TicketScanAnimation';
import { InvoiceUploadResult } from '@/components/recify/InvoiceUploadResult';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePreprocessTicket, useUploadTicket } from '@/hooks/use-upload-ticket';
import { useUploadInvoice } from '@/hooks/use-invoices';
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
import type { UploadInvoiceResponse } from '@/types/invoice';
import { Upload, Camera, FileImage, FileText, Loader2, CheckCircle2, Edit3, Save, Plus, Receipt, XCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/api/http';
import {
  createIndividualUploadFlow,
  type ActiveUploadContext,
} from '@/utils/individual-upload-flow';

type UploadState = 'idle' | 'uploaded' | 'analyzing' | 'done';
type UploadMode = 'ticket' | 'invoice';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PDF_MIME_TYPE = 'application/pdf';
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const PAYMENT_OPTIONS: { value: BackendPaymentMethod; label: string }[] = [
  { value: 'card', label: 'Tarjeta' },
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
  { value: 'egreso', label: 'Gasto' },
];

export default function UploadPage() {
  const [state, setState] = useState<UploadState>('idle');
  const [uploadMode, setUploadMode] = useState<UploadMode>('ticket');
  const [invoiceResult, setInvoiceResult] = useState<UploadInvoiceResponse | null>(null);
  const [ticket, setTicket] = useState<UiTicket | null>(null);
  const [editBaseline, setEditBaseline] = useState<TicketEditDraft | null>(null);
  const [draft, setDraft] = useState<TicketEditDraft | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [imageDialogUrl, setImageDialogUrl] = useState<string | null>(null);
  const [hasPersistedTicket, setHasPersistedTicket] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const companyIdRef = useRef<string | null>(null);
  const previousCompanyIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const saveClaimRef = useRef(false);
  const invoiceClaimRef = useRef(false);
  const uploadFlowRef = useRef(createIndividualUploadFlow());
  const { token, companyId } = useAuth();
  const preprocessMutation = usePreprocessTicket();
  const uploadMutation = useUploadTicket();
  const updateMutation = useUpdateDashboardTicket();
  const invoiceMutation = useUploadInvoice();

  companyIdRef.current = companyId;
  const isBusy =
    preprocessMutation.isPending ||
    uploadMutation.isPending ||
    updateMutation.isPending ||
    invoiceMutation.isPending;
  const editValidationMessage = useMemo(() => getTicketEditValidationMessage(draft), [draft]);
  const hasEditChanges = useMemo(() => hasTicketEditChanges(editBaseline, draft), [editBaseline, draft]);
  const canSaveEdit = Boolean(draft && editBaseline && hasEditChanges && !editValidationMessage);
  const editing = Boolean(draft);

  const replacePreview = useCallback((nextPreview: string | undefined) => {
    const previousPreview = previewUrlRef.current;
    setImageDialogUrl((current) => (current ? nextPreview ?? null : null));
    if (previousPreview && previousPreview !== nextPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    previewUrlRef.current = nextPreview;
    setPreviewUrl(nextPreview);
  }, []);

  const clearUploadState = useCallback(() => {
    uploadFlowRef.current.cancel();
    saveClaimRef.current = false;
    invoiceClaimRef.current = false;
    replacePreview(undefined);
    setState('idle');
    setUploadMode('ticket');
    setInvoiceResult(null);
    setTicket(null);
    setEditBaseline(null);
    setDraft(null);
    setSelectedFile(null);
    setHasPersistedTicket(false);
    preprocessMutation.reset();
    uploadMutation.reset();
    updateMutation.reset();
    invoiceMutation.reset();
  }, [invoiceMutation, preprocessMutation, replacePreview, updateMutation, uploadMutation]);

  useEffect(() => {
    const previousCompanyId = previousCompanyIdRef.current;
    previousCompanyIdRef.current = companyId;
    if (previousCompanyId === null || previousCompanyId === companyId) return;

    const hadActiveUpload = Boolean(uploadFlowRef.current.getActive());
    clearUploadState();
    if (hadActiveUpload) {
      toast.info('El análisis se canceló porque cambiaste de compañía.');
    }
  }, [clearUploadState, companyId]);

  useEffect(() => {
    mountedRef.current = true;
    const uploadFlow = uploadFlowRef.current;
    return () => {
      mountedRef.current = false;
      uploadFlow.cancel();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = undefined;
      }
    };
  }, []);

  const formatMXN = useCallback(
    (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
    [],
  );

  const extractError = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  const isAbortLike = (err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return err instanceof Error && /aborted|aborterror|canceled|cancelled/i.test(err.message);
  };

  const isCurrentFlow = (context: ActiveUploadContext, signal?: AbortSignal) =>
    mountedRef.current &&
    !signal?.aborted &&
    uploadFlowRef.current.isCurrent(context, companyIdRef.current);

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
      toast.error('Formato no permitido. Usa PNG, JPG o PDF.');
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('El archivo supera el máximo de 10 MB.');
      return false;
    }
    return true;
  };

  const extractInvoiceError = (err: unknown): string => {
    if (err instanceof ApiRequestError) {
      switch (err.status) {
        case 400:
          return err.message || 'El archivo no es un PDF válido.';
        case 409:
          return 'Esta factura ya existe: hay otra con el mismo folio fiscal.';
        case 422:
          return 'No pudimos leer los datos del CFDI. Intenta con un PDF legible de una página.';
        case 429:
          return 'Alcanzaste el límite de subidas. Espera unos minutos e intenta de nuevo.';
        default:
          return err.message || 'No se pudo procesar la factura.';
      }
    }
    if (err instanceof Error) return err.message || 'No se pudo procesar la factura.';
    return 'No se pudo procesar la factura.';
  };

  const runInvoiceUpload = async (file: File) => {
    if (invoiceClaimRef.current) return;
    if (!validateSession()) return;
    if (!companyId) return;
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('El archivo supera el máximo de 10 MB.');
      return;
    }

    invoiceClaimRef.current = true;
    const context = uploadFlowRef.current.begin(companyId);
    const controller = uploadFlowRef.current.createController(context);
    if (!controller) {
      invoiceClaimRef.current = false;
      return;
    }

    replacePreview(undefined);
    setSelectedFile(file);
    setUploadMode('invoice');
    setInvoiceResult(null);
    setTicket(null);
    setEditBaseline(null);
    setDraft(null);
    setHasPersistedTicket(false);
    setState('analyzing');

    try {
      const response = await invoiceMutation.mutateAsync({
        companyId: context.companyId,
        file,
        signal: controller.signal,
      });
      if (!isCurrentFlow(context, controller.signal)) return;

      setInvoiceResult(response);
      setState('done');
      toast.success('Factura procesada correctamente.');
    } catch (err) {
      if (!isCurrentFlow(context, controller.signal) || isAbortLike(err)) return;
      setState('idle');
      setSelectedFile(null);
      toast.error(extractInvoiceError(err));
    } finally {
      uploadFlowRef.current.releaseController(controller);
      const active = uploadFlowRef.current.getActive();
      if (
        active?.generation === context.generation &&
        active.companyId === context.companyId
      ) {
        invoiceClaimRef.current = false;
        uploadFlowRef.current.complete(context);
      }
    }
  };

  const runPreprocess = async (
    file: File,
    context: ActiveUploadContext,
    imageUrlOverride?: string,
  ) => {
    const controller = uploadFlowRef.current.createController(context);
    if (!controller || !isCurrentFlow(context, controller.signal)) return;

    setState('analyzing');
    try {
      const response = await preprocessMutation.mutateAsync({
        companyId: context.companyId,
        file,
        signal: controller.signal,
      });
      if (!isCurrentFlow(context, controller.signal)) return;

      const mapped = mapPreprocessTicket(response.ticket, {
        imageUrl: imageUrlOverride ?? previewUrlRef.current,
        fallbackId: `preview-${Date.now()}`,
        ocrText: response.ocrText,
      });
      const nextBaseline = createDraftFromAnalyzedTicket(response.ticket, mapped);
      setTicket(mapped);
      setEditBaseline(nextBaseline);
      setDraft(null);
      setState('done');
      toast.success('Ticket analizado correctamente.');
    } catch (err) {
      if (!isCurrentFlow(context, controller.signal) || isAbortLike(err)) return;
      setState('uploaded');
      toast.error(extractError(err, 'No se pudo analizar el ticket.'));
    } finally {
      uploadFlowRef.current.releaseController(controller);
    }
  };

  const handleNewFile = async (file: File | null) => {
    if (isBusy) return;
    if (!validateSession()) return;

    // Los PDF son facturas CFDI: van directo al flujo de facturas.
    if (file && file.type === PDF_MIME_TYPE) {
      await runInvoiceUpload(file);
      return;
    }

    if (!validateFile(file)) return;
    if (!companyId) return;

    const nextFile = file as File;
    const context = uploadFlowRef.current.begin(companyId);
    const nextPreview = URL.createObjectURL(nextFile);

    replacePreview(nextPreview);
    setSelectedFile(nextFile);
    setUploadMode('ticket');
    setInvoiceResult(null);
    setTicket(null);
    setEditBaseline(null);
    setDraft(null);
    setHasPersistedTicket(false);
    setState('uploaded');

    await runPreprocess(nextFile, context, nextPreview);
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

  const openCamera = () => {
    if (isBusy) return;
    if (!validateSession()) return;
    setCameraOpen(true);
  };

  const openBatch = () => {
    if (isBusy) return;
    if (!validateSession()) return;
    setBatchOpen(true);
  };

  const handleCameraCapture = (file: File) => {
    void handleNewFile(file);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0] ?? null;
    await handleNewFile(file);
    input.value = '';
  };

  const handleSave = async () => {
    if (isBusy || saveClaimRef.current || hasPersistedTicket) return;
    if (!validateSession()) return;
    if (!validateFile(selectedFile)) return;

    const context = uploadFlowRef.current.getActive();
    if (!context || context.companyId !== companyId) {
      clearUploadState();
      toast.info('El análisis se canceló porque cambiaste de compañía.');
      return;
    }

    const controller = uploadFlowRef.current.createController(context);
    if (!controller) return;

    saveClaimRef.current = true;
    const intendedDraft = editBaseline;
    try {
      const response = await uploadMutation.mutateAsync({
        companyId: context.companyId,
        file: selectedFile as File,
        signal: controller.signal,
      });
      if (!isCurrentFlow(context, controller.signal)) return;

      let persistedTicket = response.ticket;
      let mapped = mapBackendTicket(persistedTicket);
      let patchFailed = false;

      if (intendedDraft) {
        const result = buildTicketUpdatePayload(createDraftFromTicket(persistedTicket), intendedDraft);
        if (result.ok) {
          const payload = { ...result.payload };
          delete payload.reviewStatus;

          if (Object.keys(payload).length > 0) {
            const patchController = uploadFlowRef.current.createController(context);
            if (!patchController || !isCurrentFlow(context, patchController.signal)) return;

            try {
              persistedTicket = await updateMutation.mutateAsync({
                companyId: context.companyId,
                ticketId: persistedTicket._id,
                payload,
                signal: patchController.signal,
              });
              if (!isCurrentFlow(context, patchController.signal)) return;
              mapped = mapBackendTicket(persistedTicket);
            } catch (err) {
              if (!isCurrentFlow(context, patchController.signal) || isAbortLike(err)) return;
              patchFailed = true;
            } finally {
              uploadFlowRef.current.releaseController(patchController);
            }
          }
        }
      }

      if (!isCurrentFlow(context, controller.signal)) return;
      const nextTicket = {
        ...mapped,
        imagenUrl: mapped.imagenUrl ?? response.imageUrl ?? previewUrlRef.current,
      };
      setTicket(nextTicket);
      const nextBaseline = createDraftFromTicket(persistedTicket);
      setEditBaseline(nextBaseline);
      setDraft(null);
      setState('done');
      setHasPersistedTicket(true);
      uploadFlowRef.current.complete(context);
      if (patchFailed) {
        toast.warning('El ticket se guardó, pero algunos cambios no pudieron aplicarse.');
      } else {
        toast.success('Ticket guardado correctamente.');
      }
      if (response.matchedInvoice) {
        toast.info('Este ticket quedó vinculado automáticamente a una factura.');
      }
    } catch (err) {
      if (!isCurrentFlow(context, controller.signal) || isAbortLike(err)) return;
      toast.error(extractError(err, 'No se pudo guardar el ticket.'));
    } finally {
      uploadFlowRef.current.releaseController(controller);
      saveClaimRef.current = false;
    }
  };

  const handleReanalyze = async () => {
    if (!selectedFile) {
      toast.error('Primero selecciona una imagen.');
      return;
    }
    if (!validateSession() || !companyId) return;

    const context = uploadFlowRef.current.begin(companyId);
    setHasPersistedTicket(false);
    await runPreprocess(selectedFile, context);
  };

  const reset = () => {
    clearUploadState();
  };

  const ticketFields = useMemo(
    () =>
      ticket
        ? [
            { label: 'Comercio', value: ticket.comercio, key: 'comercio' },
            ...(ticket.folio ? [{ label: 'Folio', value: ticket.folio, key: 'folio' }] : []),
            { label: 'Fecha', value: ticket.fecha, key: 'fecha' },
            { label: 'Hora', value: ticket.hora, key: 'hora' },
            { label: 'Subtotal', value: formatMXN(ticket.subtotal), key: 'subtotal' },
            { label: 'IVA', value: formatMXN(ticket.iva), key: 'iva' },
            { label: 'Total', value: formatMXN(ticket.total), key: 'total' },
            { label: 'Moneda', value: ticket.moneda, key: 'moneda' },
            { label: 'Método de pago', value: ticket.metodoPago, key: 'metodoPago' },
            { label: 'Tipo', value: ticket.tipo, key: 'tipo' },
            { label: 'Estatus', value: ticket.estatus, key: 'estatus' },
            { label: 'Revisión', value: ticket.reviewStatus, key: 'reviewStatus' },
          ]
        : [],
    [ticket, formatMXN],
  );

  const editReadonlyFields = useMemo(
    () =>
      ticket
        ? [
            { label: 'Comercio', value: ticket.comercio, key: 'edit-comercio' },
            ...(ticket.folio ? [{ label: 'Folio', value: ticket.folio, key: 'edit-folio' }] : []),
            { label: 'Hora', value: ticket.hora, key: 'edit-hora' },
            { label: 'Subtotal', value: formatMXN(ticket.subtotal), key: 'edit-subtotal' },
            { label: 'IVA', value: formatMXN(ticket.iva), key: 'edit-iva' },
            { label: 'Moneda', value: ticket.moneda, key: 'edit-moneda' },
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
    setDraft(null);
    toast.success('Cambios guardados.');
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subir ticket o factura</h1>
          <p className="text-muted-foreground mt-1">
            Captura la foto de un ticket o sube el PDF de una factura (CFDI) para analizarlos
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload zone */}
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
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
                    <p className="font-medium text-foreground">Arrastra tu ticket o factura aquí</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      o haz clic para seleccionar archivo
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG o PDF · Máx. 10 MB
                  </p>
                </div>
              )}

              {state === 'uploaded' && (
                <div className="text-center space-y-3 animate-fade-in">
                  {uploadMode === 'invoice' ? (
                    <FileText size={48} className="text-primary mx-auto" />
                  ) : (
                    <FileImage size={48} className="text-primary mx-auto" />
                  )}
                  <p className="text-sm font-medium text-foreground">
                    {selectedFile?.name ?? 'ticket.jpg'}
                  </p>
                  <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                </div>
              )}

              {state === 'analyzing' && (
                <div className="animate-fade-in text-center space-y-4">
                  <TicketScanAnimation />
                  <p className="font-medium text-foreground animate-pulse-soft">
                    {uploadMode === 'invoice' ? 'Procesando factura…' : 'Analizando…'}
                  </p>
                </div>
              )}

              {state === 'done' && (
                <div className="text-center space-y-3 animate-scale-in">
                  <div className="p-3 rounded-full bg-accent text-success mx-auto w-fit">
                    <CheckCircle2 size={32} />
                  </div>
                  <p className="font-medium text-foreground">
                    {uploadMode === 'invoice'
                      ? 'Factura procesada correctamente'
                      : 'Ticket analizado correctamente'}
                  </p>
                  <p className="text-sm text-muted-foreground">Información extraída con éxito</p>
                </div>
              )}
            </div>

            {state === 'idle' && (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-11 rounded-xl"
                    onClick={openCamera}
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
                <Button
                  variant="secondary"
                  className="w-full h-11 rounded-xl"
                  onClick={openBatch}
                  disabled={isBusy}
                >
                  <Layers size={16} className="mr-2" /> Subir varios tickets
                </Button>
              </div>
            )}

            <CameraCaptureDialog
              open={cameraOpen}
              onOpenChange={setCameraOpen}
              onCapture={handleCameraCapture}
            />

            <BatchUploadDialog open={batchOpen} onOpenChange={setBatchOpen} />

            {state === 'done' && uploadMode === 'ticket' && (
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
                  fallbackImageUrl={previewUrl}
                  alt={`Ticket de ${ticket.comercio}`}
                  onView={setImageDialogUrl}
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
                      {editReadonlyFields.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-background/70 p-3">
                          {editReadonlyFields.map((field) => (
                            <div key={field.key} className="space-y-0.5">
                              <p className="text-xs text-muted-foreground">{field.label}</p>
                              <p className="text-sm font-medium text-foreground">{field.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1 h-11 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90"
                    onClick={handleSave}
                    disabled={isBusy || editing || hasPersistedTicket}
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : hasPersistedTicket ? (
                      <CheckCircle2 size={16} className="mr-2" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    {hasPersistedTicket ? 'Ticket guardado' : 'Guardar ticket'}
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

            {state === 'done' && uploadMode === 'invoice' && invoiceResult && (
              <>
                <InvoiceUploadResult key={invoiceResult.invoice._id} response={invoiceResult} />
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl"
                  onClick={reset}
                  disabled={isBusy}
                >
                  <Plus size={16} className="mr-2" /> Subir otro archivo
                </Button>
              </>
            )}

            {state === 'idle' && (
              <div className="bg-card rounded-2xl border border-border/50 p-8 shadow-elegant flex flex-col items-center justify-center min-h-[340px] text-center">
                <div className="p-4 rounded-2xl bg-accent text-accent-foreground mb-4">
                  <Receipt size={32} />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Sin archivo cargado</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Sube la foto de un ticket o el PDF de una factura para que nuestra IA extraiga
                  la información automáticamente
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <TicketImageDialog
        open={Boolean(imageDialogUrl && ticket)}
        onOpenChange={(open) => {
          if (!open) setImageDialogUrl(null);
        }}
        imageUrl={imageDialogUrl}
        alt={ticket ? `Ticket de ${ticket.comercio}` : 'Imagen del ticket'}
        title={ticket ? `Ticket de ${ticket.comercio}` : 'Imagen del ticket'}
      />
    </AppLayout>
  );
}
