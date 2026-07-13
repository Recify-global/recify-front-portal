import type { AuthUser } from '@/types/auth';

/**
 * Claves y helpers centralizados para la sesión de Recify en localStorage.
 *
 * Todo lo que lea/escriba `recify.token`, `recify.user` o `recify.companyId`
 * debe usar este módulo. Evita strings duplicados, parseo inseguro y mantiene
 * un único punto para emitir cambios de sesión al resto de la app.
 */

export const AUTH_STORAGE_KEYS = {
  token: 'recify.token',
  user: 'recify.user',
  companyId: 'recify.companyId',
} as const;

export const AUTH_EVENT = 'recify:auth-changed';

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
  const value = safeGet(AUTH_STORAGE_KEYS.token);
  return value && value.length > 0 ? value : null;
}

export function getStoredCompanyId(): string | null {
  const value = safeGet(AUTH_STORAGE_KEYS.companyId);
  return value && value.length > 0 ? value : null;
}

export function getStoredUser(): AuthUser | null {
  const raw = safeGet(AUTH_STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AuthUser;
  } catch {
    // Si el JSON está corrupto no reventamos la app: limpiamos silenciosamente
    // esa entrada para que la siguiente sesión quede consistente.
    safeRemove(AUTH_STORAGE_KEYS.user);
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
  safeSet(AUTH_STORAGE_KEYS.token, token);
  try {
    safeSet(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  const companyId = pickPrimaryCompanyId(user);
  if (companyId) {
    safeSet(AUTH_STORAGE_KEYS.companyId, companyId);
  } else {
    safeRemove(AUTH_STORAGE_KEYS.companyId);
  }
  emitAuthChange();
}

export function clearAuthSession(): void {
  safeRemove(AUTH_STORAGE_KEYS.token);
  safeRemove(AUTH_STORAGE_KEYS.user);
  safeRemove(AUTH_STORAGE_KEYS.companyId);
  emitAuthChange();
}

/**
 * Cambia la compañía activa sin tocar token ni user.
 * Solo acepta IDs presentes en `user.companies` de la sesión actual.
 */
export function setActiveCompany(companyId: string): void {
  const nextId = typeof companyId === 'string' ? companyId.trim() : '';
  if (!nextId) {
    throw new Error('companyId inválido.');
  }
  if (!getStoredToken()) {
    throw new Error('No hay sesión activa.');
  }
  const user = getStoredUser();
  if (!user || !Array.isArray(user.companies) || !user.companies.includes(nextId)) {
    throw new Error('La compañía no pertenece al usuario autenticado.');
  }
  if (getStoredCompanyId() === nextId) return;
  safeSet(AUTH_STORAGE_KEYS.companyId, nextId);
  emitAuthChange();
}

export function emitAuthChange(): void {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeAuthChanges(listener: () => void): () => void {
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function hasActiveSession(): boolean {
  return Boolean(getStoredToken() && getStoredCompanyId());
}
