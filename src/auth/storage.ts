import type { AuthUser } from '@/types/auth';
import { STORAGE_EVENTS, STORAGE_KEYS } from '@/constants/storage';

/**
 * Helpers centralizados para la sesión de Recify en localStorage.
 *
 * Las claves vienen de `@/constants/storage`. Este módulo es el único punto
 * que debería leer/escribir sesión, lo que facilita una migración futura
 * (sessionStorage, cookies HttpOnly, etc.) sin tocar el resto de la app.
 */

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getStoredToken(): string | null {
  const value = safeGet(STORAGE_KEYS.authToken);
  return value && value.length > 0 ? value : null;
}

export function getStoredCompanyId(): string | null {
  const value = safeGet(STORAGE_KEYS.companyId);
  return value && value.length > 0 ? value : null;
}

export function getStoredUser(): AuthUser | null {
  const raw = safeGet(STORAGE_KEYS.authUser);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AuthUser;
  } catch {
    // Si el JSON está corrupto no reventamos la app: limpiamos silenciosamente
    // esa entrada para que la siguiente sesión quede consistente.
    safeRemove(STORAGE_KEYS.authUser);
    return null;
  }
}

export function pickPrimaryCompanyId(user: AuthUser | null | undefined): string | null {
  if (!user || !Array.isArray(user.companies)) return null;
  const first = user.companies[0];
  if (typeof first !== 'string' || first.length === 0) return null;
  return first;
}

export interface PersistSessionInput {
  token: string;
  user: AuthUser;
}

export function setAuthSession({ token, user }: PersistSessionInput): void {
  safeSet(STORAGE_KEYS.authToken, token);
  try {
    safeSet(STORAGE_KEYS.authUser, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  const companyId = pickPrimaryCompanyId(user);
  if (companyId) {
    safeSet(STORAGE_KEYS.companyId, companyId);
  } else {
    safeRemove(STORAGE_KEYS.companyId);
  }
  emitAuthChange();
}

export function clearAuthSession(): void {
  safeRemove(STORAGE_KEYS.authToken);
  safeRemove(STORAGE_KEYS.authUser);
  safeRemove(STORAGE_KEYS.companyId);
  emitAuthChange();
}

export function emitAuthChange(): void {
  try {
    window.dispatchEvent(new Event(STORAGE_EVENTS.authChanged));
  } catch {
    /* ignore */
  }
}

export function subscribeAuthChanges(listener: () => void): () => void {
  window.addEventListener(STORAGE_EVENTS.authChanged, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(STORAGE_EVENTS.authChanged, listener);
    window.removeEventListener('storage', listener);
  };
}

export function hasActiveSession(): boolean {
  return Boolean(getStoredToken() && getStoredCompanyId());
}
