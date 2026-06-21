import { useCallback, useEffect, useRef, useState } from 'react';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import { mapPreprocessTicket, mapBackendTicket } from '@/mappers/ticket.mapper';
import type { UiTicket } from '@/types/ticket';
import { useAuth } from './use-auth';
import { ApiRequestError } from '@/api/http';

export type BatchItemStatus =
  | 'queued'
  | 'analyzing'
  | 'analyzed'
  | 'saving'
  | 'saved'
  | 'error';

export interface BatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BatchItemStatus;
  ticket: UiTicket | null;
  /** Resultado tras guardar (incluye URL definitiva de la imagen). */
  savedTicket: UiTicket | null;
  error: string | null;
}

export interface UseBatchUploadOptions {
  /** Cantidad máxima de archivos por batch. */
  maxFiles?: number;
  /** Cuántos preprocess corren en paralelo. */
  concurrency?: number;
  /** MIME types permitidos. */
  allowedMimeTypes?: string[];
  /** Tamaño máximo por archivo en bytes. */
  maxBytes?: number;
}

const DEFAULT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

interface AddFilesResult {
  added: number;
  rejected: { file: File; reason: string }[];
}

/**
 * Maneja la cola de subida en lote: recibe archivos, lanza `preprocess` con
 * un límite de concurrencia, y expone acciones para guardar (`upload`) o
 * descartar ítems individuales.
 *
 * Diseñado para "cola con revisión manual": el usuario revisa cada resultado
 * y decide guardar.
 */
export function useBatchUpload(options: UseBatchUploadOptions = {}) {
  const {
    maxFiles = 10,
    concurrency = 3,
    allowedMimeTypes = DEFAULT_MIMES,
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;

  const { companyId } = useAuth();
  const [items, setItems] = useState<BatchItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const inFlightRef = useRef(0);

  // Limpieza de object URLs al desmontar.
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const processItem = useCallback(
    async (item: BatchItem) => {
      if (!companyId) {
        updateItem(item.id, { status: 'error', error: 'No hay compañía activa.' });
        return;
      }
      updateItem(item.id, { status: 'analyzing', error: null });
      try {
        const response = await preprocessTicket(companyId, item.file);
        const mapped = mapPreprocessTicket(response.ticket, {
          imageUrl: item.previewUrl,
          fallbackId: `${item.id}-preview`,
          ocrText: response.ocrText,
        });
        updateItem(item.id, { status: 'analyzed', ticket: mapped });
      } catch (err) {
        const message =
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : 'No se pudo analizar el ticket.';
        updateItem(item.id, { status: 'error', error: message });
      }
    },
    [companyId, updateItem],
  );

  /**
   * Bucle cooperativo que va lanzando trabajos respetando `concurrency`.
   * Se reactiva cada vez que cambia el array de ítems.
   */
  useEffect(() => {
    const queued = items.filter((it) => it.status === 'queued');
    if (queued.length === 0) return;
    const slots = Math.max(0, concurrency - inFlightRef.current);
    if (slots === 0) return;

    queued.slice(0, slots).forEach((item) => {
      inFlightRef.current += 1;
      void processItem(item).finally(() => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        // Forzar un re-render para que el efecto se vuelva a evaluar y
        // tome el siguiente ítem queued si hay slots libres.
        setItems((prev) => [...prev]);
      });
    });
  }, [items, concurrency, processItem]);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!allowedMimeTypes.includes(file.type)) {
        return 'Formato no permitido.';
      }
      if (file.size > maxBytes) {
        return `Supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`;
      }
      return null;
    },
    [allowedMimeTypes, maxBytes],
  );

  const addFiles = useCallback(
    (files: FileList | File[]): AddFilesResult => {
      const incoming = Array.from(files);
      const rejected: { file: File; reason: string }[] = [];

      setItems((prev) => {
        const slotsLeft = Math.max(0, maxFiles - prev.length);
        if (slotsLeft === 0) {
          incoming.forEach((f) =>
            rejected.push({ file: f, reason: `Máximo ${maxFiles} archivos por lote.` }),
          );
          return prev;
        }

        const accepted: BatchItem[] = [];
        for (const file of incoming) {
          if (accepted.length >= slotsLeft) {
            rejected.push({ file, reason: `Máximo ${maxFiles} archivos por lote.` });
            continue;
          }
          const reason = validateFile(file);
          if (reason) {
            rejected.push({ file, reason });
            continue;
          }
          accepted.push({
            id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${accepted.length}`,
            file,
            previewUrl: URL.createObjectURL(file),
            status: 'queued',
            ticket: null,
            savedTicket: null,
            error: null,
          });
        }
        return [...prev, ...accepted];
      });

      return { added: incoming.length - rejected.length, rejected };
    },
    [maxFiles, validateFile],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const retryItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.status === 'error'
          ? { ...it, status: 'queued', error: null }
          : it,
      ),
    );
  }, []);

  const saveItem = useCallback(
    async (id: string): Promise<boolean> => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item || !companyId) return false;
      if (item.status !== 'analyzed') return false;
      updateItem(id, { status: 'saving', error: null });
      try {
        const response = await uploadTicket(companyId, item.file);
        const mapped = mapBackendTicket(response.ticket);
        updateItem(id, {
          status: 'saved',
          savedTicket: {
            ...mapped,
            imagenUrl: mapped.imagenUrl ?? response.imageUrl ?? item.previewUrl,
          },
        });
        return true;
      } catch (err) {
        const message =
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : 'No se pudo guardar el ticket.';
        updateItem(id, { status: 'error', error: message });
        return false;
      }
    },
    [companyId, updateItem],
  );

  const saveAllAnalyzed = useCallback(async (): Promise<{ ok: number; failed: number }> => {
    const ids = itemsRef.current
      .filter((it) => it.status === 'analyzed')
      .map((it) => it.id);
    let ok = 0;
    let failed = 0;
    // Reusamos saveItem (que es secuencial por id) pero los disparamos en paralelo
    // — el backend tolera múltiples uploads concurrentes.
    const results = await Promise.allSettled(ids.map((id) => saveItem(id)));
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) ok += 1;
      else failed += 1;
    });
    return { ok, failed };
  }, [saveItem]);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((it) => URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  const counts = items.reduce(
    (acc, it) => {
      acc[it.status] += 1;
      return acc;
    },
    {
      queued: 0,
      analyzing: 0,
      analyzed: 0,
      saving: 0,
      saved: 0,
      error: 0,
    } as Record<BatchItemStatus, number>,
  );

  return {
    items,
    counts,
    addFiles,
    removeItem,
    retryItem,
    saveItem,
    saveAllAnalyzed,
    updateItem,
    clear,
    maxFiles,
  };
}
