import { clearAuthSession, getStoredToken } from '@/auth/storage';

type CacheCleanup = () => Promise<void>;

let cacheCleanup: CacheCleanup | null = null;
let cleanupInFlight: Promise<void> | null = null;
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

/**
 * Terminación única de sesión para logout manual y respuestas 401.
 * El storage se limpia incluso si cancelar queries falla.
 */
export function terminateAuthSession(): Promise<void> {
  if (cleanupInFlight) return cleanupInFlight;
  if (sessionClosing && !getStoredToken()) return Promise.resolve();

  sessionClosing = true;
  const cleanup = cacheCleanup;
  const task = (async () => {
    try {
      await cleanup?.();
    } catch {
      // La sesión debe eliminarse aunque React Query no pueda cancelar.
    } finally {
      clearAuthSession();
    }
  })();

  cleanupInFlight = task.finally(() => {
    cleanupInFlight = null;
  });
  return cleanupInFlight;
}
