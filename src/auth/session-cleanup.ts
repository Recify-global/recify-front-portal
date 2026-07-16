import {
  clearAuthSession,
  getAuthSessionGeneration,
  getStoredToken,
} from '@/auth/storage';

type CacheCleanup = () => Promise<void>;

let cacheCleanup: CacheCleanup | null = null;
let cleanupInFlight: Promise<void> | null = null;
let cleanupInFlightGeneration: number | null = null;
let activeClosingGeneration: number | null = null;
let sessionClosing = false;

/**
 * Registra el cleanup del QueryClient real montado por la aplicación.
 * Solo puede existir un registro activo porque hay un solo provider.
 */
export function registerSessionCacheCleanup(cleanup: CacheCleanup): () => void {
  cacheCleanup = cleanup;
  return () => {
    if (cacheCleanup === cleanup) cacheCleanup = null;
  };
}

export function markAuthSessionActive(): void {
  sessionClosing = false;
}

export function isAuthSessionClosing(): boolean {
  return sessionClosing;
}

/** Generación capturada por el cleanup en curso; null si no hay cierre activo. */
export function getActiveClosingGeneration(): number | null {
  return activeClosingGeneration;
}

/** Indica si un cleanup tardío todavía puede afectar storage o caché. */
export function shouldFinalizeSessionCleanup(closingGeneration: number): boolean {
  return getAuthSessionGeneration() === closingGeneration;
}

/**
 * Terminación de sesión para logout manual y respuestas 401.
 * Solo deduplica cleanups de la misma generación; un login posterior invalida
 * el cierre anterior sin borrar la sesión nueva.
 */
export function terminateAuthSession(): Promise<void> {
  const closingGeneration = getAuthSessionGeneration();

  if (cleanupInFlight && cleanupInFlightGeneration === closingGeneration) {
    return cleanupInFlight;
  }
  if (
    sessionClosing &&
    !getStoredToken() &&
    shouldFinalizeSessionCleanup(closingGeneration)
  ) {
    return Promise.resolve();
  }

  sessionClosing = true;
  activeClosingGeneration = closingGeneration;
  const cleanup = cacheCleanup;
  const task = (async () => {
    try {
      await cleanup?.();
    } catch {
      // La sesión debe eliminarse aunque React Query no pueda cancelar.
    } finally {
      if (shouldFinalizeSessionCleanup(closingGeneration)) {
        clearAuthSession();
      }
    }
  })();

  cleanupInFlightGeneration = closingGeneration;
  cleanupInFlight = task.finally(() => {
    if (activeClosingGeneration === closingGeneration) {
      activeClosingGeneration = null;
    }
    if (cleanupInFlightGeneration === closingGeneration) {
      cleanupInFlight = null;
      cleanupInFlightGeneration = null;
    }
    if (!getStoredToken()) {
      sessionClosing = false;
    }
  });
  return cleanupInFlight;
}
