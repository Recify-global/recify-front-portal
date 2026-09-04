import { useCallback, useEffect, useRef, useState } from 'react';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import { mapBackendTicket, mapPreprocessTicket } from '@/mappers/ticket.mapper';
import type { UiTicket } from '@/types/ticket';
import { useAuth } from './use-auth';
import { ApiRequestError } from '@/api/http';
import {
  captureAuthMutationContext,
  isAuthMutationContextCurrent,
} from '@/auth/session-cleanup';

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
  /** Identidad estable para dedupe: name|size|lastModified */
  fileKey: string;
  previewUrl: string;
  status: BatchItemStatus;
  /** Compañía con la que se encoló el ítem. */
  companyId: string;
  ticket: UiTicket | null;
  savedTicket: UiTicket | null;
  error: string | null;
}

export interface UseBatchUploadOptions {
  maxFiles?: number;
  analyzeConcurrency?: number;
  saveConcurrency?: number;
  allowedMimeTypes?: string[];
  maxBytes?: number;
}

const DEFAULT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

interface AddFilesResult {
  added: number;
  rejected: { file: File; reason: string }[];
}

function fileKeyOf(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function extractError(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError || err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

function isAbortLike(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && /aborted|AbortError/i.test(err.message)) return true;
  return false;
}

export type BatchSaveResult = {
  /** La request HTTP de guardado llegó a completarse para esta compañía. */
  persisted: boolean;
  /** Compañía del ítem (origen del lote), no la activa actual. */
  companyId: string | null;
  /** La UI del lote pudo actualizarse (mismo generation / compañía). */
  uiUpdated: boolean;
  /** Permite invalidaciones/toasts solo para la misma sesión que inició el save. */
  effectsAllowed: boolean;
  /** Reservado: el backend ya no auto-vincula facturas (siempre false). */
  matchedInvoice: boolean;
  /** La imagen resultó ser una captura de saldo (se guardó un Balance, no un ticket). */
  balance: boolean;
};

function emptyCounts(): Record<BatchItemStatus, number> {
  return {
    queued: 0,
    analyzing: 0,
    analyzed: 0,
    saving: 0,
    saved: 0,
    error: 0,
  };
}

/**
 * Cola de análisis/guardado por lotes sobre endpoints individuales
 * (`preprocess` / `upload`). Ligada a la compañía activa: al cambiar
 * companyId se limpia la cola y se ignoran respuestas tardías.
 */
export function useBatchUpload(options: UseBatchUploadOptions = {}) {
  const {
    maxFiles = 10,
    analyzeConcurrency = 3,
    saveConcurrency = 2,
    allowedMimeTypes = DEFAULT_MIMES,
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;

  const { companyId } = useAuth();
  const [items, setItems] = useState<BatchItem[]>([]);

  const itemsRef = useRef<BatchItem[]>([]);
  const companyIdRef = useRef(companyId);
  const generationRef = useRef(0);
  const analyzeInFlightRef = useRef(0);
  const saveInFlightRef = useRef(0);
  const abortByIdRef = useRef<Map<string, AbortController>>(new Map());

  const syncItems = useCallback((next: BatchItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<BatchItem>) => {
      const next = itemsRef.current.map((it) => (it.id === id ? { ...it, ...patch } : it));
      syncItems(next);
    },
    [syncItems],
  );

  const abortAll = useCallback(() => {
    abortByIdRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    });
    abortByIdRef.current.clear();
  }, []);

  const clear = useCallback(() => {
    abortAll();
    generationRef.current += 1;
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    analyzeInFlightRef.current = 0;
    saveInFlightRef.current = 0;
    syncItems([]);
  }, [abortAll, syncItems]);

  // Multitenancy P0: cambio de compañía invalida el lote y respuestas tardías.
  useEffect(() => {
    const prev = companyIdRef.current;
    companyIdRef.current = companyId;
    if (prev !== companyId) {
      clear();
    }
  }, [companyId, clear]);

  useEffect(() => {
    return () => {
      abortAll();
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
  }, [abortAll]);

  const isStale = useCallback(
    (generation: number, itemCompanyId: string) => {
      return (
        generation !== generationRef.current ||
        itemCompanyId !== companyIdRef.current ||
        !companyIdRef.current
      );
    },
    [],
  );

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

  const runAnalyze = useCallback(
    async (item: BatchItem, generation: number) => {
      const controller = new AbortController();
      abortByIdRef.current.set(item.id, controller);

      try {
        const response = await preprocessTicket(item.companyId, item.file, {
          signal: controller.signal,
        });
        if (isStale(generation, item.companyId) || controller.signal.aborted) return;

        const mapped = mapPreprocessTicket(response.ticket, {
          imageUrl: item.previewUrl,
          fallbackId: `${item.id}-preview`,
          ocrText: response.ocrText,
        });
        patchItem(item.id, { status: 'analyzed', ticket: mapped, error: null });
      } catch (err) {
        if (isStale(generation, item.companyId) || controller.signal.aborted || isAbortLike(err)) {
          return;
        }
        patchItem(item.id, {
          status: 'error',
          error: extractError(err, 'No se pudo analizar el ticket.'),
        });
      } finally {
        abortByIdRef.current.delete(item.id);
      }
    },
    [isStale, patchItem],
  );

  const pumpAnalyze = useCallback(() => {
    const generation = generationRef.current;
    const activeCompany = companyIdRef.current;
    if (!activeCompany) return;

    while (analyzeInFlightRef.current < analyzeConcurrency) {
      const next = itemsRef.current.find(
        (it) => it.status === 'queued' && it.companyId === activeCompany,
      );
      if (!next) break;

      // Claim atómico en el ref antes de lanzar la request (evita doble proceso).
      const claimed: BatchItem = { ...next, status: 'analyzing', error: null };
      syncItems(itemsRef.current.map((it) => (it.id === claimed.id ? claimed : it)));

      analyzeInFlightRef.current += 1;
      void runAnalyze(claimed, generation).finally(() => {
        analyzeInFlightRef.current = Math.max(0, analyzeInFlightRef.current - 1);
        pumpAnalyze();
      });
    }
  }, [analyzeConcurrency, runAnalyze, syncItems]);

  const addFiles = useCallback(
    (files: FileList | File[]): AddFilesResult => {
      const incoming = Array.from(files);
      const rejected: { file: File; reason: string }[] = [];
      const activeCompany = companyIdRef.current;

      if (!activeCompany) {
        incoming.forEach((file) =>
          rejected.push({ file, reason: 'No hay compañía activa.' }),
        );
        return { added: 0, rejected };
      }

      const existingKeys = new Set(itemsRef.current.map((it) => it.fileKey));
      const accepted: BatchItem[] = [];
      const slotsLeft = Math.max(0, maxFiles - itemsRef.current.length);

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
        const key = fileKeyOf(file);
        if (existingKeys.has(key) || accepted.some((a) => a.fileKey === key)) {
          rejected.push({ file, reason: 'Archivo duplicado en el lote.' });
          continue;
        }
        accepted.push({
          id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}-${accepted.length}`,
          file,
          fileKey: key,
          previewUrl: URL.createObjectURL(file),
          status: 'queued',
          companyId: activeCompany,
          ticket: null,
          savedTicket: null,
          error: null,
        });
        existingKeys.add(key);
      }

      if (accepted.length > 0) {
        syncItems([...itemsRef.current, ...accepted]);
        queueMicrotask(() => pumpAnalyze());
      }

      return { added: accepted.length, rejected };
    },
    [maxFiles, pumpAnalyze, syncItems, validateFile],
  );

  const removeItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((it) => it.id === id);
      if (!target) return;
      if (target.status === 'analyzing' || target.status === 'saving') {
        const controller = abortByIdRef.current.get(id);
        controller?.abort();
        abortByIdRef.current.delete(id);
      }
      URL.revokeObjectURL(target.previewUrl);
      syncItems(itemsRef.current.filter((it) => it.id !== id));
    },
    [syncItems],
  );

  const retryItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((it) => it.id === id);
      if (!target || target.status !== 'error') return;
      if (target.companyId !== companyIdRef.current) {
        clear();
        return;
      }
      syncItems(
        itemsRef.current.map((it) =>
          it.id === id ? { ...it, status: 'queued', error: null } : it,
        ),
      );
      queueMicrotask(() => pumpAnalyze());
    },
    [clear, pumpAnalyze, syncItems],
  );

  const runSave = useCallback(
    async (item: BatchItem, generation: number): Promise<BatchSaveResult> => {
      const controller = new AbortController();
      abortByIdRef.current.set(item.id, controller);
      const originCompanyId = item.companyId;
      const authContext = captureAuthMutationContext();

      try {
        const response = await uploadTicket(originCompanyId, item.file, {
          signal: controller.signal,
        });
        const effectsAllowed = isAuthMutationContextCurrent(authContext);

        // Persistió en la compañía de origen aunque la UI ya haya cambiado de tenant.
        const isBalance = response.kind === 'balance';

        if (
          !effectsAllowed ||
          isStale(generation, originCompanyId) ||
          controller.signal.aborted
        ) {
          return {
            persisted: true,
            companyId: originCompanyId,
            uiUpdated: false,
            effectsAllowed,
            matchedInvoice: false,
            balance: isBalance,
          };
        }

        // Una captura de saldo se guardó como Balance, no como ticket: no hay
        // savedTicket que mostrar en el lote.
        if (isBalance) {
          patchItem(item.id, { status: 'saved', savedTicket: null, error: null });
          return {
            persisted: true,
            companyId: originCompanyId,
            uiUpdated: true,
            effectsAllowed: true,
            matchedInvoice: false,
            balance: true,
          };
        }

        const mapped = mapBackendTicket(response.ticket);
        patchItem(item.id, {
          status: 'saved',
          savedTicket: {
            ...mapped,
            imagenUrl: mapped.imagenUrl ?? response.imageUrl ?? item.previewUrl,
          },
          error: null,
        });
        return {
          persisted: true,
          companyId: originCompanyId,
          uiUpdated: true,
          effectsAllowed: true,
          matchedInvoice: false,
          balance: false,
        };
      } catch (err) {
        if (controller.signal.aborted || isAbortLike(err)) {
          return {
            persisted: false,
            companyId: originCompanyId,
            uiUpdated: false,
            effectsAllowed: isAuthMutationContextCurrent(authContext),
            matchedInvoice: false,
            balance: false,
          };
        }
        if (
          !isAuthMutationContextCurrent(authContext) ||
          isStale(generation, originCompanyId)
        ) {
          return {
            persisted: false,
            companyId: originCompanyId,
            uiUpdated: false,
            effectsAllowed: false,
            matchedInvoice: false,
            balance: false,
          };
        }
        patchItem(item.id, {
          status: 'error',
          error: extractError(err, 'No se pudo guardar el ticket.'),
        });
        return {
          persisted: false,
          companyId: originCompanyId,
          uiUpdated: true,
          effectsAllowed: true,
          matchedInvoice: false,
          balance: false,
        };
      } finally {
        abortByIdRef.current.delete(item.id);
      }
    },
    [isStale, patchItem],
  );

  const saveItem = useCallback(
    async (id: string): Promise<BatchSaveResult> => {
      let claimed: BatchItem | null = null;
      const generation = generationRef.current;

      const next = itemsRef.current.map((it) => {
        if (it.id !== id) return it;
        if (it.status !== 'analyzed') return it;
        if (it.companyId !== companyIdRef.current) return it;
        claimed = { ...it, status: 'saving', error: null };
        return claimed;
      });

      if (!claimed) {
        const existing = itemsRef.current.find((it) => it.id === id);
        if (existing && existing.companyId !== companyIdRef.current) {
          clear();
        }
        return {
          persisted: false,
          companyId: existing?.companyId ?? null,
          uiUpdated: false,
          effectsAllowed: true,
          matchedInvoice: false,
          balance: false,
        };
      }

      syncItems(next);
      saveInFlightRef.current += 1;
      try {
        return await runSave(claimed, generation);
      } finally {
        saveInFlightRef.current = Math.max(0, saveInFlightRef.current - 1);
      }
    },
    [clear, runSave, syncItems],
  );

  const saveAll = useCallback(async (): Promise<{
    ok: number;
    failed: number;
    persistedCompanyIds: string[];
    matchedInvoiceCompanyIds: string[];
    balanceCompanyIds: string[];
  }> => {
    const generation = generationRef.current;
    const activeCompany = companyIdRef.current;
    if (!activeCompany) {
      return {
        ok: 0,
        failed: 0,
        persistedCompanyIds: [],
        matchedInvoiceCompanyIds: [],
        balanceCompanyIds: [],
      };
    }

    const queue = itemsRef.current.filter(
      (it) => it.status === 'analyzed' && it.companyId === activeCompany,
    );
    let ok = 0;
    let failed = 0;
    let index = 0;
    const persistedCompanyIds = new Set<string>();
    const matchedInvoiceCompanyIds = new Set<string>();
    const balanceCompanyIds = new Set<string>();

    const workers = Array.from({ length: Math.min(saveConcurrency, queue.length) }, async () => {
      while (index < queue.length) {
        if (generation !== generationRef.current) return;
        const currentIndex = index;
        index += 1;
        const item = queue[currentIndex];
        if (!item) continue;

        let claimed: BatchItem | null = null;
        const next = itemsRef.current.map((it) => {
          if (it.id !== item.id || it.status !== 'analyzed') return it;
          claimed = { ...it, status: 'saving', error: null };
          return claimed;
        });
        if (!claimed) continue;
        syncItems(next);

        saveInFlightRef.current += 1;
        try {
          const result = await runSave(claimed, generation);
          if (result.persisted && result.companyId) {
            if (result.effectsAllowed) {
              persistedCompanyIds.add(result.companyId);
              if (result.matchedInvoice) {
                matchedInvoiceCompanyIds.add(result.companyId);
              }
              if (result.balance) {
                balanceCompanyIds.add(result.companyId);
              }
            }
            ok += 1;
          } else if (!result.persisted) {
            failed += 1;
          }
        } finally {
          saveInFlightRef.current = Math.max(0, saveInFlightRef.current - 1);
        }
      }
    });

    await Promise.all(workers);
    return {
      ok,
      failed,
      persistedCompanyIds: Array.from(persistedCompanyIds),
      matchedInvoiceCompanyIds: Array.from(matchedInvoiceCompanyIds),
      balanceCompanyIds: Array.from(balanceCompanyIds),
    };
  }, [runSave, saveConcurrency, syncItems]);

  const counts = items.reduce((acc, it) => {
    acc[it.status] += 1;
    return acc;
  }, emptyCounts());

  const isProcessing =
    counts.queued > 0 ||
    counts.analyzing > 0 ||
    counts.saving > 0 ||
    analyzeInFlightRef.current > 0 ||
    saveInFlightRef.current > 0;

  return {
    items,
    counts,
    isProcessing,
    addFiles,
    removeItem,
    retryItem,
    saveItem,
    saveAll,
    clear,
    maxFiles,
    boundCompanyId: companyId,
  };
}
