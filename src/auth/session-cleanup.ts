import {
  advanceAuthSessionGeneration,
  clearAuthSession,
  getAuthSessionGeneration,
  getStoredToken,
  isCurrentAuthSessionGeneration,
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

export type AuthMutationContext = {
  authSessionGeneration: number;
};

/** Capturar al comenzar la mutación, nunca al montar el hook. */
export function captureAuthMutationContext(): AuthMutationContext {
  return { authSessionGeneration: getAuthSessionGeneration() };
}

export function isAuthMutationContextCurrent(
  context: AuthMutationContext | null | undefined,
): boolean {
  return Boolean(
    context && isCurrentAuthSessionGeneration(context.authSessionGeneration),
  );
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
  const currentGeneration = getAuthSessionGeneration();

  if (cleanupInFlight && cleanupInFlightGeneration === currentGeneration) {
    return cleanupInFlight;
  }
  if (
    sessionClosing &&
    !getStoredToken() &&
    activeClosingGeneration === currentGeneration
  ) {
    return Promise.resolve();
  }

  // Invalida callbacks de queries/mutaciones antes de comenzar el cleanup.
  const closingGeneration = advanceAuthSessionGeneration();
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
        clearAuthSession({ advanceGeneration: false });
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
