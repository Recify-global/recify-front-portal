import { ApiRequestError } from '@/api/http';

/** El contrato de integrantes todavía no está publicado; no se llama ninguna URL. */
export class TeamContractUnavailableError extends Error {
  constructor(message = 'El listado del equipo no está disponible por ahora.') {
    super(message);
    this.name = 'TeamContractUnavailableError';
  }
}

export class TeamMappingError extends Error {
  constructor(message = 'La respuesta del equipo no tiene un formato válido.') {
    super(message);
    this.name = 'TeamMappingError';
  }
}

export function isTeamAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof ApiRequestError && err.status === 0) {
    return /aborted|aborterror|canceled|cancelled/i.test(err.message);
  }
  return err instanceof Error && /aborted|aborterror|canceled|cancelled/i.test(err.message);
}

/**
 * Mensajes seguros para UI de Mi equipo.
 * Nunca reexpone stacks, rutas internas ni `error.message` crudo de 5xx.
 */
export function getTeamUserErrorMessage(err: unknown, fallback: string): string {
  if (isTeamAbortError(err)) return '';

  if (err instanceof TeamContractUnavailableError) {
    return err.message;
  }

  if (err instanceof TeamMappingError) {
    return 'No se pudo leer la información del equipo. Intenta de nuevo.';
  }

  if (err instanceof ApiRequestError) {
    switch (err.status) {
      case 400:
      case 422:
        return 'La solicitud no es válida. Revisa los datos e intenta de nuevo.';
      case 401:
        return 'Tu sesión expiró. Inicia sesión de nuevo.';
      case 403:
        return 'No tienes permiso para realizar esta acción.';
      case 404:
        return 'No encontramos ese integrante.';
      case 409:
        return 'La operación no se puede completar porque el estado cambió. Actualiza e intenta de nuevo.';
      case 429:
        return 'Se alcanzó el límite de consultas. Espera unos minutos e intenta de nuevo.';
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
    if (/compañía|compania|sesión|sesion/i.test(err.message)) {
      return err.message;
    }
  }

  return fallback;
}

export function shouldRetryTeamQuery(failureCount: number, error: unknown): boolean {
  if (isTeamAbortError(error)) return false;
  if (error instanceof TeamContractUnavailableError) return false;
  if (error instanceof TeamMappingError) return false;
  if (error instanceof ApiRequestError) {
    if ([401, 403, 404, 409, 422, 429].includes(error.status)) return false;
    if (error.status === 0) return failureCount < 1;
    if (error.status >= 500) return failureCount < 1;
    return false;
  }
  return failureCount < 1;
}
