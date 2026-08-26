const MAX_INVOICE_PDF_BYTES = 10 * 1024 * 1024;
const PDF_MIME = 'application/pdf';

export type InvoicePdfValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validación UX de PDF CFDI. No sustituye la validación del backend
 * (magic bytes, páginas, etc.).
 */
export function validateInvoicePdfFile(file: File | null | undefined): InvoicePdfValidationResult {
  if (!file) {
    return { ok: false, message: 'Selecciona un archivo PDF para continuar.' };
  }

  if (file.size <= 0) {
    return { ok: false, message: 'El archivo está vacío.' };
  }

  if (file.size > MAX_INVOICE_PDF_BYTES) {
    return { ok: false, message: 'El archivo supera el máximo de 10 MB.' };
  }

  const mime = (file.type || '').toLowerCase();
  const name = file.name || '';
  const hasPdfExtension = /\.pdf$/i.test(name);

  if (mime === PDF_MIME) return { ok: true };
  if (!mime && hasPdfExtension) return { ok: true };

  return {
    ok: false,
    message: 'Solo se admiten archivos PDF de CFDI (máx. 10 MB).',
  };
}

export const INVOICE_PDF_ACCEPT = 'application/pdf,.pdf';
export const INVOICE_PDF_HINT = 'PDF de CFDI · Máx. 10 MB · 1 página';
export { MAX_INVOICE_PDF_BYTES, PDF_MIME as INVOICE_PDF_MIME };
