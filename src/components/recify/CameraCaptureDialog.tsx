import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, Loader2, AlertTriangle } from 'lucide-react';
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
  /** Entrega el File al flujo individual de Upload (mismo handler que un archivo). */
  onCapture: (file: File) => void;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
}

/**
 * Captura una foto con getUserMedia y la entrega como File.
 * Solicita la cámara solo al abrir y detiene todos los tracks al cerrar/desmontar.
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
  const openRef = useRef(open);
  openRef.current = open;
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

  const attachStreamToVideo = useCallback(() => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => {
      /* autoplay puede fallar; el usuario verá el frame al interactuar */
    });
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    setSnapshot(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          'Este navegador no permite usar la cámara, o el contexto no es seguro (se requiere HTTPS o localhost).',
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Si el diálogo se cerró mientras pedíamos permiso, liberar de inmediato.
      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      attachStreamToVideo();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Permiso de cámara denegado. Actívalo en el navegador e inténtalo de nuevo.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.');
      } else if (name === 'NotReadableError') {
        setError('La cámara está en uso por otra aplicación.');
      } else {
        setError('No se pudo iniciar la cámara. Prueba con otro navegador o sube un archivo.');
      }
    } finally {
      setStarting(false);
    }
  }, [attachStreamToVideo]);

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

  // Reintentar attach cuando el <video> ya está montado (Dialog abre de forma async).
  useEffect(() => {
    if (open && !snapshot && !error) {
      attachStreamToVideo();
    }
  }, [open, snapshot, error, attachStreamToVideo, starting]);
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('La cámara aún no está lista.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('No se pudo capturar la imagen.');
      return;
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL(mimeType, quality);
    setSnapshot(dataUrl);
    stopStream();
  };

  const handleRetake = () => {
    setSnapshot(null);
    void startStream();
  };

  const handleConfirm = async () => {
    if (!snapshot) return;
    try {
      const res = await fetch(snapshot);
      const blob = await res.blob();
      const ext = mimeType.split('/')[1] ?? 'jpg';
      const file = new File([blob], `camera-${Date.now()}.${ext}`, { type: mimeType });
      onCapture(file);
      onOpenChange(false);
    } catch {
      setError('No se pudo preparar la imagen capturada.');
    }
  };

  const handleClose = () => {
    stopStream();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopStream();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tomar foto del ticket</DialogTitle>
          <DialogDescription>
            Usa la cámara del dispositivo. La foto se analizará como un ticket individual.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
          {starting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : snapshot ? (
            <img src={snapshot} alt="Captura" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          {!error && !snapshot && (
            <Button onClick={handleCapture} disabled={starting}>
              <Camera size={16} className="mr-2" /> Capturar
            </Button>
          )}
          {snapshot && (
            <>
              <Button variant="outline" onClick={handleRetake}>
                <RefreshCcw size={16} className="mr-2" /> Repetir
              </Button>
              <Button onClick={() => void handleConfirm()}>Usar foto</Button>
            </>
          )}
          {error && (
            <Button onClick={() => void startStream()}>
              <RefreshCcw size={16} className="mr-2" /> Reintentar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
