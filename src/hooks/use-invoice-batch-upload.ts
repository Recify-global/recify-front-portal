import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/api/http';
import { uploadInvoice } from '@/services/upload.service';
import type { BackendInvoice } from '@/types/invoice';
import { useAuth } from './use-auth';
import {
  getInvoiceUploadErrorMessage,
  isInvoiceAbortError,
} from '@/utils/invoice-errors';
import {
  invoicePdfRejectionMessage,
  validateInvoicePdfFile,
} from '@/utils/invoice-file';
import { MAX_INVOICE_FILES_PER_BATCH } from '@/utils/upload-file';

export const INVOICE_UPLOAD_CONCURRENCY = 2;

export type InvoiceBatchStatus = 'pending' | 'uploading' | 'saved' | 'error';

export interface InvoiceBatchItem {
  id: string;
  file: File;
  fileKey: string;
  status: InvoiceBatchStatus;
  companyId: string;
  error: string | null;
  /** La red falló después de enviar: el servidor pudo haber guardado la factura. */
  unconfirmed: boolean;
  invoiceId: string | null;
}

export interface InvoiceAddFilesResult {
  added: number;
  rejected: { file: File; reason: string }[];
}

export interface InvoiceUploadAllResult {
  saved: Array<{ companyId: string; invoice: BackendInvoice }>;
  failed: number;
  /** Un envío ya estaba en curso; no se lanzó otro. */
  alreadyRunning: boolean;
}

export interface UseInvoiceBatchUploadOptions {
  maxFiles?: number;
  uploadConcurrency?: number;
}

function fileKeyOf(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function createId(index: number): string {
  const random = Math.floor(Math.random() * 1e6);
  return `${Date.now()}-${random}-${index}`;
}

function isConfirmedInvoice(value: unknown): value is BackendInvoice {
  if (!value || typeof value !== 'object') return false;
  const id = (value as { _id?: unknown })._id;
  return typeof id === 'string' && id.length > 0;
}

const UNCONFIRMED_MESSAGE =
  'No se pudo confirmar si la factura se guardó. Revisa el historial antes de reintentar.';

function failureOf(err: unknown): { message: string; unconfirmed: boolean } {
  if (err instanceof ApiRequestError && err.status === 0) {
    return { message: UNCONFIRMED_MESSAGE, unconfirmed: true };
  }
  return {
    message: getInvoiceUploadErrorMessage(err) || 'No se pudo procesar la factura.',
    unconfirmed: false,
  };
}

/**
 * Cola de facturas sobre el endpoint individual `POST .../upload/invoice`
 * (un PDF, campo `file`). Seleccionar no envía: el usuario confirma.
 * Al cambiar de compañía se aborta el lote y se ignoran respuestas tardías.
 */
export function useInvoiceBatchUpload(options: UseInvoiceBatchUploadOptions = {}) {
  const {
    maxFiles = MAX_INVOICE_FILES_PER_BATCH,
    uploadConcurrency = INVOICE_UPLOAD_CONCURRENCY,
  } = options;

  const { companyId } = useAuth();
  const [items, setItems] = useState<InvoiceBatchItem[]>([]);

  const itemsRef = useRef<InvoiceBatchItem[]>([]);
  const companyIdRef = useRef(companyId);
  const generationRef = useRef(0);
  const inFlightRef = useRef(0);
  const uploadingRef = useRef(false);
  const abortByIdRef = useRef<Map<string, AbortController>>(new Map());

  const syncItems = useCallback((next: InvoiceBatchItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<InvoiceBatchItem>) => {
      const next = itemsRef.current.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      );
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
    inFlightRef.current = 0;
    uploadingRef.current = false;
    syncItems([]);
  }, [abortAll, syncItems]);

  useEffect(() => {
    const previous = companyIdRef.current;
    companyIdRef.current = companyId;
    if (previous !== companyId) clear();
  }, [companyId, clear]);

  useEffect(() => {
    return () => {
      abortAll();
    };
  }, [abortAll]);

  const isStale = useCallback((generation: number, itemCompanyId: string) => {
    return (
      generation !== generationRef.current ||
      itemCompanyId !== companyIdRef.current ||
      !companyIdRef.current
    );
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]): Promise<InvoiceAddFilesResult> => {
      const incoming = Array.from(files);
      const rejected: { file: File; reason: string }[] = [];
      const activeCompany = companyIdRef.current;

      if (!activeCompany) {
        incoming.forEach((file) => rejected.push({ file, reason: 'No hay compañía activa.' }));
        return { added: 0, rejected };
      }

      const existingKeys = new Set(itemsRef.current.map((item) => item.fileKey));
      const accepted: InvoiceBatchItem[] = [];
      const slotsLeft = Math.max(0, maxFiles - itemsRef.current.length);

      for (const file of incoming) {
        if (accepted.length >= slotsLeft) {
          rejected.push({ file, reason: `Máximo ${maxFiles} archivos por lote.` });
          continue;
        }
        const validation = await validateInvoicePdfFile(file);
        const reason = invoicePdfRejectionMessage(validation);
        if (reason) {
          rejected.push({ file, reason });
          continue;
        }
        const key = fileKeyOf(file);
        if (existingKeys.has(key) || accepted.some((item) => item.fileKey === key)) {
          rejected.push({ file, reason: 'Archivo duplicado en el lote.' });
          continue;
        }
        accepted.push({
          id: createId(accepted.length),
          file,
          fileKey: key,
          status: 'pending',
          companyId: activeCompany,
          error: null,
          unconfirmed: false,
          invoiceId: null,
        });
        existingKeys.add(key);
      }

      if (accepted.length > 0) {
        syncItems([...itemsRef.current, ...accepted]);
      }

      return { added: accepted.length, rejected };
    },
    [maxFiles, syncItems],
  );

  const removeItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target || target.status === 'uploading') return;
      syncItems(itemsRef.current.filter((item) => item.id !== id));
    },
    [syncItems],
  );

  const retryItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target || target.status !== 'error') return;
      if (target.companyId !== companyIdRef.current) {
        clear();
        return;
      }
      patchItem(id, { status: 'pending', error: null, unconfirmed: false, invoiceId: null });
    },
    [clear, patchItem],
  );

  const uploadAll = useCallback(async (): Promise<InvoiceUploadAllResult> => {
    if (uploadingRef.current) {
      return { saved: [], failed: 0, alreadyRunning: true };
    }

    const activeCompany = companyIdRef.current;
    const generation = generationRef.current;
    const selected = itemsRef.current.filter(
      (item) => item.status === 'pending' && item.companyId === activeCompany,
    );
    if (!activeCompany || selected.length === 0) {
      return { saved: [], failed: 0, alreadyRunning: false };
    }

    uploadingRef.current = true;
    const allowed = new Set(selected.map((item) => item.id));
    const saved: InvoiceUploadAllResult['saved'] = [];
    let failed = 0;
    let stopQueue = false;

    const runOne = async (item: InvoiceBatchItem) => {
      const controller = new AbortController();
      abortByIdRef.current.set(item.id, controller);
      try {
        const response = await uploadInvoice(item.companyId, item.file, {
          signal: controller.signal,
        });
        if (isStale(generation, item.companyId) || controller.signal.aborted) return;
        if (!isConfirmedInvoice(response?.invoice)) {
          failed += 1;
          patchItem(item.id, {
            status: 'error',
            error: UNCONFIRMED_MESSAGE,
            unconfirmed: true,
            invoiceId: null,
          });
          return;
        }
        patchItem(item.id, {
          status: 'saved',
          error: null,
          unconfirmed: false,
          invoiceId: response.invoice._id,
        });
        saved.push({ companyId: item.companyId, invoice: response.invoice });
      } catch (err) {
        if (isStale(generation, item.companyId) || controller.signal.aborted || isInvoiceAbortError(err)) {
          return;
        }
        if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
          stopQueue = true;
        }
        const failure = failureOf(err);
        failed += 1;
        patchItem(item.id, {
          status: 'error',
          error: failure.message,
          unconfirmed: failure.unconfirmed,
          invoiceId: null,
        });
      } finally {
        abortByIdRef.current.delete(item.id);
      }
    };

    await new Promise<void>((resolve) => {
      const launch = () => {
        if (generation !== generationRef.current || !companyIdRef.current) {
          if (inFlightRef.current === 0) resolve();
          return;
        }

        while (!stopQueue && inFlightRef.current < uploadConcurrency) {
          const next = itemsRef.current.find(
            (item) => allowed.has(item.id) && item.status === 'pending',
          );
          if (!next) break;
          allowed.delete(next.id);
          patchItem(next.id, { status: 'uploading', error: null, unconfirmed: false });
          inFlightRef.current += 1;
          void runOne({ ...next, status: 'uploading' }).finally(() => {
            inFlightRef.current = Math.max(0, inFlightRef.current - 1);
            launch();
          });
        }

        if (inFlightRef.current === 0) resolve();
      };

      launch();
    });

    uploadingRef.current = false;
    return { saved, failed, alreadyRunning: false };
  }, [isStale, patchItem, uploadConcurrency]);

  const pendingCount = items.filter((item) => item.status === 'pending').length;
  const isUploading = items.some((item) => item.status === 'uploading');

  return {
    items,
    maxFiles,
    pendingCount,
    isUploading,
    addFiles,
    removeItem,
    retryItem,
    uploadAll,
    clear,
  };
}
