import { ApiRequestError } from '@/api/http';

/** Errores de cancelación / abort no deben mostrarse al usuario. */
export function isInvoiceAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof ApiRequestError && err.status === 0) {
    return /aborted|aborterror|canceled|cancelled/i.test(err.message);
  }
  return err instanceof Error && /aborted|aborterror|canceled|cancelled/i.test(err.message);
}

function retryAfterHint(err: ApiRequestError): string | null {
  const raw = err.issues?.find((issue) => /retry/i.test(issue.path ?? ''))?.message;
  if (raw && /^\d+$/.test(raw.trim())) {
    const seconds = Number(raw.trim());
    if (seconds > 0 && seconds < 3600) {
      const minutes = Math.ceil(seconds / 60);
      return minutes <= 1
        ? 'Espera un momento e intenta de nuevo.'
        : `Espera unos ${minutes} minutos e intenta de nuevo.`;
    }
  }
  return null;
}

/**
 * Mensajes seguros para UI de Facturas.
 * Nunca reexpone stacks, rutas internas ni `error.message` crudo de 5xx.
 */
export function getInvoiceUserErrorMessage(err: unknown, fallback: string): string {
  if (isInvoiceAbortError(err)) return '';

  if (err instanceof ApiRequestError) {
    switch (err.status) {
      case 400:
        return 'La solicitud no es válida. Revisa los datos e intenta de nuevo.';
      case 401:
        return 'Tu sesión expiró. Inicia sesión de nuevo.';
      case 403:
        return 'No tienes permiso para realizar esta acción.';
      case 404:
        return 'No encontramos esa factura.';
      case 409:
        return 'La operación no se puede completar porque el estado cambió. Actualiza e intenta de nuevo.';
      case 413:
        return 'El archivo es demasiado grande.';
      case 415:
        return 'El formato del archivo no es compatible.';
      case 422:
        return 'No pudimos leer los datos del CFDI. Intenta con un PDF legible de una página.';
      case 429: {
        const hint = retryAfterHint(err);
        return hint
          ? `Se alcanzó el límite de consultas. ${hint}`
          : 'Se alcanzó el límite de consultas. Espera unos minutos e intenta de nuevo.';
      }
      case 500:
      case 502:
      case 503:
      case 504:
        return 'El servicio no está disponible por ahora. Intenta más tarde.';
      case 0:
        return 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.';
      default:
        if (err.status >= 500) {
          return 'El servicio no está disponible por ahora. Intenta más tarde.';
        }
        return fallback;
    }
  }

  if (err instanceof Error && err.message.trim()) {
    // Mensajes de validación local conocidos (compañía ausente, etc.).
    if (/compañía|compania|sesión|sesion/i.test(err.message)) {
      return err.message;
    }
  }

  return fallback;
}

/** Errores específicos del upload de CFDI (sin exponer mensajes crudos de 5xx). */
export function getInvoiceUploadErrorMessage(err: unknown): string {
  if (isInvoiceAbortError(err)) return '';
  if (err instanceof ApiRequestError) {
    if (err.status === 400) return 'El archivo no es un PDF válido.';
    if (err.status === 409) {
      return 'Esta factura ya existe: hay otra con el mismo folio fiscal.';
    }
  }
  return (
    getInvoiceUserErrorMessage(err, 'No se pudo procesar la factura.') ||
    'No se pudo procesar la factura.'
  );
}

/** Retry consciente de status para queries de Facturas. */
export function shouldRetryInvoiceQuery(failureCount: number, error: unknown): boolean {
  if (isInvoiceAbortError(error)) return false;
  if (error instanceof ApiRequestError) {
    if ([401, 403, 404, 409, 422, 429].includes(error.status)) return false;
    if (error.status === 0) return failureCount < 1;
    if (error.status >= 500) return failureCount < 1;
    return false;
  }
  return failureCount < 1;
}
