import {
  advanceAuthSessionGeneration,
  clearAuthSession,
  getAuthSessionGeneration,
  getStoredUser,
  isCurrentAuthSessionGeneration,
} from '@/auth/storage';

type CacheCleanup = () => Promise<void>;

let cacheCleanup: CacheCleanup | null = null;
let cleanupInFlight: Promise<void> | null = null;
let cleanupInFlightGeneration: number | null = null;
let activeClosingGeneration: number | null = null;
let sessionClosing = false;
let logoutAbort: AbortController | null = null;

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

/** Abre una generación de cierre para el logout antes de llamar al servidor. */
export function openSignOut(): number {
  const closingGeneration = advanceAuthSessionGeneration();
  sessionClosing = true;
  activeClosingGeneration = closingGeneration;
  return closingGeneration;
}

/**
 * The browser applies Set-Cookie in arrival order. Aborting a logout that has
 * not been received yet discards that response. A response already applied
 * cannot be recalled from here.
 */
export function beginLogoutAbort(): AbortSignal {
  abortInFlightLogout();
  logoutAbort = new AbortController();
  return logoutAbort.signal;
}

export function abortInFlightLogout(): void {
  logoutAbort?.abort();
  logoutAbort = null;
}

export function finishLogoutAbort(signal: AbortSignal): void {
  if (logoutAbort?.signal === signal) logoutAbort = null;
}

export async function drainSessionCacheCleanup(): Promise<void> {
  const cleanup = cacheCleanup;
  try {
    await cleanup?.();
  } catch {
    // La interfaz privada se oculta aunque la caché no pueda cancelarse.
  }
}

export function releaseSignOutGeneration(closingGeneration: number): void {
  if (activeClosingGeneration === closingGeneration) {
    activeClosingGeneration = null;
  }
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
    !getStoredUser() &&
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
    if (!getStoredUser()) {
      sessionClosing = false;
    }
  });
  return cleanupInFlight;
}
