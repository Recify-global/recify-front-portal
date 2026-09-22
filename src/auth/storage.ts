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

/** Generación monotónica en memoria; nunca se persiste ni retrocede. */
let authSessionGeneration = 0;

export function getAuthSessionGeneration(): number {
  return authSessionGeneration;
}

export function advanceAuthSessionGeneration(): number {
  authSessionGeneration += 1;
  return authSessionGeneration;
}

export function isCurrentAuthSessionGeneration(generation: number): boolean {
  return generation === authSessionGeneration;
}

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

function isStoredAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user._id === 'string' &&
    user._id.length > 0 &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    (user.platformRole === null || user.platformRole === 'admin') &&
    (user.status === 'active' || user.status === 'inactive' || user.status === 'suspended') &&
    Array.isArray(user.memberships) &&
    user.memberships.every((membership) => {
      if (!membership || typeof membership !== 'object' || Array.isArray(membership)) return false;
      const item = membership as Record<string, unknown>;
      return (
        typeof item.membershipId === 'string' &&
        typeof item.companyId === 'string' &&
        item.companyId.length > 0 &&
        typeof item.companyName === 'string' &&
        typeof item.companyTimezone === 'string' &&
        (item.companyStatus === 'active' || item.companyStatus === 'suspended') &&
        (item.role === 'accountant' || item.role === 'viewer') &&
        item.status === 'active'
      );
    })
  );
}

export function getStoredToken(): string | null {
  const value = safeGet(AUTH_STORAGE_KEYS.token);
  return value && value.length > 0 ? value : null;
}

export function getStoredCompanyId(): string | null {
  const value = safeGet(AUTH_STORAGE_KEYS.companyId);
  if (!value || value.length === 0) return null;
  const rawUser = safeGet(AUTH_STORAGE_KEYS.user);
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser) as unknown;
    if (
      isStoredAuthUser(parsed) &&
      parsed.memberships.some(
        (membership) =>
          membership.status === 'active' &&
          membership.companyStatus === 'active' &&
          membership.companyId === value,
      )
    ) {
      return value;
    }
  } catch {
    // Invalid session data is cleared by getStoredUser.
  }
  safeRemove(AUTH_STORAGE_KEYS.companyId);
  return null;
}

export function getStoredUser(): AuthUser | null {
  const raw = safeGet(AUTH_STORAGE_KEYS.user);
  if (!raw) {
    if (safeGet(AUTH_STORAGE_KEYS.token) || safeGet(AUTH_STORAGE_KEYS.companyId)) {
      clearAuthSession();
    }
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isStoredAuthUser(parsed) && safeGet(AUTH_STORAGE_KEYS.token)) return parsed;
  } catch {
    // El cleanup completo ocurre debajo.
  }
  // Un perfil inválido no puede convivir con token/company válidos: el guard
  // no debe reconstruir una sesión parcial desde storage corrupto.
  clearAuthSession();
  return null;
}

export function pickPrimaryCompanyId(user: AuthUser | null | undefined): string | null {
  if (!user || user.memberships.length !== 1) return null;
  return user.memberships[0]?.companyStatus === 'active'
    ? user.memberships[0].companyId
    : null;
}

export interface PersistSessionInput {
  token: string;
  user: AuthUser;
}

export function setAuthSession({ token, user }: PersistSessionInput): void {
  advanceAuthSessionGeneration();
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

export function updateStoredUser(user: AuthUser): void {
  if (!getStoredToken()) return;
  const previousCompanyId = safeGet(AUTH_STORAGE_KEYS.companyId);
  safeSet(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  const previousStillValid = user.memberships.some(
    (membership) =>
      membership.companyId === previousCompanyId &&
      membership.companyStatus === 'active',
  );
  if (!previousStillValid) {
    const onlyCompanyId = pickPrimaryCompanyId(user);
    if (onlyCompanyId) safeSet(AUTH_STORAGE_KEYS.companyId, onlyCompanyId);
    else safeRemove(AUTH_STORAGE_KEYS.companyId);
  }
  emitAuthChange();
}

export function clearAuthSession(options: { advanceGeneration?: boolean } = {}): void {
  if (options.advanceGeneration !== false) {
    advanceAuthSessionGeneration();
  }
  safeRemove(AUTH_STORAGE_KEYS.token);
  safeRemove(AUTH_STORAGE_KEYS.user);
  safeRemove(AUTH_STORAGE_KEYS.companyId);
  emitAuthChange();
}

/**
 * Cambia la compañía activa sin tocar token ni user.
 * Solo acepta IDs presentes en las memberships activas de la sesión actual.
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
  if (
    !user ||
    !user.memberships.some(
      (membership) =>
        membership.companyId === nextId && membership.companyStatus === 'active',
    )
  ) {
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

export function getActiveMembership(user = getStoredUser()) {
  const companyId = getStoredCompanyId();
  if (!user || !companyId) return null;
  return user.memberships.find((membership) => membership.companyId === companyId) ?? null;
}
