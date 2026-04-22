import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/recify/AppLayout';
import { StatusBadge } from '@/components/recify/StatusBadge';
import { CategoryBadge } from '@/components/recify/CategoryBadge';
import { ConfidenceIndicator } from '@/components/recify/ConfidenceIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { usePreprocessTicket, useUploadTicket } from '@/hooks/use-upload-ticket';
import { mapBackendTicket, mapPreprocessTicket } from '@/mappers/ticket.mapper';
import type { UiTicket } from '@/types/ticket';
import { Upload, Camera, FileImage, Loader2, CheckCircle2, Edit3, Save, Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/api/http';

type UploadState = 'idle' | 'uploaded' | 'analyzing' | 'done';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export default function UploadPage() {
  const [state, setState] = useState<UploadState>('idle');
  const [ticket, setTicket] = useState<UiTicket | null>(null);
  const [editing, setEditing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { token, companyId } = useAuth();
  const preprocessMutation = usePreprocessTicket();
  const uploadMutation = useUploadTicket();

  const isBusy = preprocessMutation.isPending || uploadMutation.isPending;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const formatMXN = useCallback((n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, []);

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
      toast.error('El archivo supera el máximo de 10MB.');
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
      setTicket(mapped);
      setEditing(false);
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
    setEditing(false);
    setState('uploaded');

    await runPreprocess(nextFile, nextPreview);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, [isBusy]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy) return;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    void handleNewFile(file);
  }, [isBusy]);

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
    if (editing) {
      toast.info('Los cambios manuales aún no se sincronizan con el backend en esta fase.');
    }

    try {
      const response = await uploadMutation.mutateAsync({ file: selectedFile as File });
      const mapped = mapBackendTicket(response.ticket);
      setTicket({
        ...mapped,
        imagenUrl: mapped.imagenUrl ?? response.imageUrl ?? previewUrl,
      });
      setEditing(false);
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
    setEditing(false);
    setSelectedFile(null);
    setPreviewUrl(undefined);
    preprocessMutation.reset();
    uploadMutation.reset();
  };

  const ticketFields = useMemo(() => (
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
      : []
  ), [ticket, formatMXN]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subir ticket</h1>
          <p className="text-muted-foreground mt-1">Captura o sube una imagen de tu ticket para analizarlo</p>
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
              className={`relative bg-card border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center min-h-[340px] transition-all cursor-pointer ${
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
                    <p className="text-sm text-muted-foreground mt-1">o haz clic para seleccionar archivo</p>
                  </div>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WEBP o GIF hasta 10MB</p>
                </div>
              )}

              {state === 'uploaded' && (
                <div className="text-center space-y-3 animate-fade-in">
                  <FileImage size={48} className="text-primary mx-auto" />
                  <p className="text-sm font-medium text-foreground">{selectedFile?.name ?? 'ticket.jpg'}</p>
                  <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                </div>
              )}

              {state === 'analyzing' && (
                <div className="text-center space-y-4 animate-fade-in">
                  <div className="relative">
                    <FileImage size={48} className="text-muted-foreground mx-auto opacity-50" />
                    <Loader2 size={24} className="absolute -bottom-1 -right-1 text-primary animate-spin mx-auto" style={{ left: '50%', transform: 'translateX(8px)' }} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Analizando ticket...</p>
                    <p className="text-sm text-muted-foreground mt-1">Extrayendo información con IA</p>
                  </div>
                  <div className="w-48 mx-auto">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-shimmer" style={{ width: '70%', backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.5) 50%, hsl(var(--primary)) 100%)' }} />
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
                <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={openFilePicker} disabled={isBusy}>
                  <Camera size={16} className="mr-2" /> Tomar foto
                </Button>
                <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={openFilePicker} disabled={isBusy}>
                  <Upload size={16} className="mr-2" /> Subir archivo
                </Button>
              </div>
            )}

            {state === 'done' && (
              <Button onClick={handleReanalyze} className="w-full h-11 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90" disabled={isBusy}>
                {preprocessMutation.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                Analizar ticket
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
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Confianza del análisis</span>
                    <ConfidenceIndicator value={ticket.confianza} />
                  </div>
                </div>

                {/* Detail fields */}
                <div className="bg-card rounded-2xl border border-border/50 p-5 shadow-elegant animate-slide-in-right">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Información extraída</h3>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)} className="rounded-lg text-muted-foreground hover:text-foreground">
                      <Edit3 size={14} className="mr-1" /> {editing ? 'Cancelar' : 'Editar'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {ticketFields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{field.label}</Label>
                        {editing ? (
                          <Input defaultValue={field.value} className="h-9 rounded-lg text-sm bg-background" />
                        ) : (
                          <p className="text-sm font-medium text-foreground">{field.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notas</Label>
                    {editing ? (
                      <Input defaultValue={ticket.notas} className="h-9 rounded-lg text-sm bg-background" />
                    ) : (
                      <p className="text-sm text-muted-foreground">{ticket.notas}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button className="flex-1 h-11 rounded-xl bg-gradient-primary text-primary-foreground hover:opacity-90" onClick={handleSave} disabled={isBusy}>
                    {uploadMutation.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                    Guardar ticket
                  </Button>
                  <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={reset} disabled={isBusy}>
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
                  Sube una foto o imagen de un ticket para que nuestra IA extraiga la información automáticamente
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
