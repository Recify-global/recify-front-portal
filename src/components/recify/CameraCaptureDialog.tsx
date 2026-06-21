import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, X, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe el File generado a partir de la captura. */
  onCapture: (file: File) => void;
  /** MIME type de la imagen resultante. Default: image/jpeg. */
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Calidad (0-1) cuando aplica al MIME (jpeg/webp). Default: 0.92. */
  quality?: number;
}

/**
 * Diálogo que abre la cámara del dispositivo en vivo y permite capturar una
 * imagen estática que se entrega al consumidor como un File listo para subir.
 *
 * Usa `getUserMedia` con preferencia por la cámara trasera (`environment`) para
 * el caso típico de fotografiar tickets en móvil. En desktop cae a la webcam
 * frontal.
 */
export function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  mimeType = 'image/jpeg',
  quality = 0.92,
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    setSnapshot(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Tu navegador no soporta acceso a la cámara.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          /* algunos navegadores requieren gesto del usuario; ignoramos */
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? mapCameraError(err)
          : 'No se pudo iniciar la cámara.';
      setError(message);
      stopStream();
    } finally {
      setStarting(false);
    }
  }, [stopStream]);

  // Arrancar/parar el stream según el estado del diálogo.
  useEffect(() => {
    if (open) {
      void startStream();
    } else {
      stopStream();
      setSnapshot(null);
      setError(null);
    }
    return () => {
      stopStream();
    };
  }, [open, startStream, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(mimeType, quality);
    setSnapshot(dataUrl);
  };

  const handleRetake = () => {
    setSnapshot(null);
    void startStream();
  };

  const handleConfirm = async () => {
    if (!snapshot) return;
    const file = await dataUrlToFile(snapshot, mimeType);
    onCapture(file);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tomar foto del ticket</DialogTitle>
          <DialogDescription>
            Encuadra el ticket dentro del marco y mantén la cámara estable.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full overflow-hidden rounded-xl bg-black aspect-[3/4] sm:aspect-video">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <AlertTriangle size={32} className="text-amber-400" />
              <p className="text-sm">{error}</p>
              <Button variant="secondary" size="sm" onClick={startStream} className="mt-2">
                Reintentar
              </Button>
            </div>
          ) : snapshot ? (
            <img src={snapshot} alt="Captura" className="h-full w-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 className="animate-spin" />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:order-1"
          >
            <X size={16} className="mr-2" />
            Cancelar
          </Button>
          {snapshot ? (
            <div className="flex gap-2 sm:order-2">
              <Button variant="outline" onClick={handleRetake}>
                <RefreshCcw size={16} className="mr-2" />
                Repetir
              </Button>
              <Button onClick={handleConfirm}>Usar esta foto</Button>
            </div>
          ) : (
            <Button
              onClick={handleCapture}
              disabled={Boolean(error) || starting}
              className="sm:order-2"
            >
              <Camera size={16} className="mr-2" />
              Capturar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mapCameraError(err: Error): string {
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permiso denegado. Habilita el acceso a la cámara en tu navegador.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ninguna cámara conectada.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'La cámara está siendo usada por otra aplicación.';
    case 'OverconstrainedError':
      return 'La cámara no soporta la configuración solicitada.';
    case 'SecurityError':
      return 'Acceso a la cámara bloqueado. Asegúrate de usar HTTPS o localhost.';
    default:
      return err.message || 'No se pudo iniciar la cámara.';
  }
}

async function dataUrlToFile(dataUrl: string, mimeType: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const filename = `ticket-${Date.now()}.${ext}`;
  return new File([blob], filename, { type: mimeType });
}
