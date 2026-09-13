import {
  GENERIC_BINARY_MIME,
  MAX_UPLOAD_FILE_BYTES,
} from '@/utils/upload-file';

const PDF_MIME = 'application/pdf';
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export type InvoicePdfValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Comprobación ligera para feedback y enrutamiento UX. El backend repite la
 * validación de firma como autoridad del contrato.
 */
export async function hasPdfSignature(file: File): Promise<boolean> {
  try {
    const header = new Uint8Array(await readBlob(file.slice(0, PDF_SIGNATURE.length)));
    return PDF_SIGNATURE.every((byte, index) => header[index] === byte);
  } catch {
    return false;
  }
}

export async function isInvoicePdfCandidate(file: File): Promise<boolean> {
  const mime = (file.type || '').toLowerCase();
  if (mime === PDF_MIME) return true;
  if (mime && mime !== GENERIC_BINARY_MIME) return false;
  return hasPdfSignature(file);
}

export async function validateInvoicePdfFile(
  file: File | null | undefined,
): Promise<InvoicePdfValidationResult> {
  if (!file) {
    return { ok: false, message: 'Selecciona un archivo PDF para continuar.' };
  }

  if (file.size <= 0) {
    return { ok: false, message: 'El archivo está vacío.' };
  }

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return { ok: false, message: 'El archivo supera el máximo de 10 MB.' };
  }

  const mime = (file.type || '').toLowerCase();
  if (mime && mime !== PDF_MIME && mime !== GENERIC_BINARY_MIME) {
    return {
      ok: false,
      message: 'Solo se admiten archivos PDF de CFDI (máx. 10 MB).',
    };
  }

  if (!(await hasPdfSignature(file))) {
    return {
      ok: false,
      message: 'El contenido del archivo no corresponde a un PDF válido.',
    };
  }

  return { ok: true };
}

export const INVOICE_PDF_ACCEPT = 'application/pdf,.pdf';
