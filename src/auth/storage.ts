import type { AuthUser } from '@/types/auth';

/**
 * Preferencia de empresa y señal entre pestañas. El JWT de sesión no se guarda.
 * `recify.token` es una clave legacy que solo se borra.
 */
export const AUTH_STORAGE_KEYS = {
  token: 'recify.token',
  user: 'recify.user',
  companyId: 'recify.companyId',
  sessionSignal: 'recify.sessionSignal',
} as const;

export const AUTH_EVENT = 'recify:auth-changed';

export type SessionStatus =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'offline'
  | 'forbidden'
  | 'signing-out';

export interface ClientSession {
  status: SessionStatus;
  user: AuthUser | null;
  companyId: string | null;
  revocationConfirmed: boolean | null;
  logoutError: string | null;
}

let authSessionGeneration = 0;
let probeBlocked = false;
let snapshot: ClientSession = {
  status: 'loading',
  user: null,
  companyId: null,
  revocationConfirmed: null,
  logoutError: null,
};

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

export function isProbeBlocked(): boolean {
  return probeBlocked;
}

export function setProbeBlocked(blocked: boolean): void {
  probeBlocked = blocked;
}

export function getClientSession(): ClientSession {
  return snapshot;
}

function publish(next: ClientSession): void {
  snapshot = next;
  emitAuthChange();
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

/** Borra solo el JWT legacy. No toca tema ni otras preferencias. */
export function purgeLegacyJwt(): void {
  safeRemove(AUTH_STORAGE_KEYS.token);
}

function readCompanyPreference(): string | null {
  const value = safeGet(AUTH_STORAGE_KEYS.companyId);
  return value && value.length > 0 ? value : null;
}

export function pickPrimaryCompanyId(user: AuthUser | null | undefined): string | null {
  if (!user || user.memberships.length !== 1) return null;
  return user.memberships[0]?.companyStatus === 'active'
    ? user.memberships[0].companyId
    : null;
}

function resolveCompanyId(user: AuthUser, preferred: string | null): string | null {
  const allowed = user.memberships.some(
    (membership) =>
      membership.companyId === preferred &&
      membership.status === 'active' &&
      membership.companyStatus === 'active',
  );
  if (preferred && allowed) return preferred;
  return pickPrimaryCompanyId(user);
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return typeof user._id === 'string' && user._id.length > 0 && Array.isArray(user.memberships);
}

export function getStoredToken(): string | null {
  purgeLegacyJwt();
  return null;
}

export function getStoredUser(): AuthUser | null {
  return snapshot.user;
}

export function getStoredCompanyId(): string | null {
  const user = snapshot.user;
  const stored = readCompanyPreference();
  if (user && stored && stored !== snapshot.companyId) {
    const allowed = user.memberships.some(
      (membership) =>
        membership.companyId === stored &&
        membership.status === 'active' &&
        membership.companyStatus === 'active',
    );
    if (!allowed) safeRemove(AUTH_STORAGE_KEYS.companyId);
  }
  return snapshot.companyId;
}

type SessionInput = AuthUser | { user: AuthUser; token?: string };

function readUser(input: SessionInput): AuthUser {
  if (input && typeof input === 'object' && 'user' in input && isAuthUser(input.user)) {
    return input.user;
  }
  return input as AuthUser;
}

export function setAuthSession(input: SessionInput, options: { signal?: boolean } = {}): void {
  advanceAuthSessionGeneration();
  probeBlocked = false;
  purgeLegacyJwt();
  safeRemove(AUTH_STORAGE_KEYS.user);
  const user = readUser(input);
  const companyId = resolveCompanyId(user, readCompanyPreference());
  if (companyId) safeSet(AUTH_STORAGE_KEYS.companyId, companyId);
  else safeRemove(AUTH_STORAGE_KEYS.companyId);
  publish({
    status: 'authenticated',
    user,
    companyId,
    revocationConfirmed: null,
    logoutError: null,
  });
  if (options.signal !== false) writeSessionSignal('in');
}

export function updateStoredUser(user: AuthUser): void {
  if (snapshot.status !== 'authenticated' || !snapshot.user) return;
  const previousCompanyId = snapshot.companyId;
  const previousStillValid = user.memberships.some(
    (membership) =>
      membership.companyId === previousCompanyId &&
      membership.companyStatus === 'active',
  );
  const companyId = previousStillValid
    ? previousCompanyId
    : pickPrimaryCompanyId(user);
  if (companyId) safeSet(AUTH_STORAGE_KEYS.companyId, companyId);
  else safeRemove(AUTH_STORAGE_KEYS.companyId);
  publish({
    ...snapshot,
    user,
    companyId,
  });
}

export function clearAuthSession(options: { advanceGeneration?: boolean; signal?: boolean } = {}): void {
  if (options.advanceGeneration !== false) advanceAuthSessionGeneration();
  purgeLegacyJwt();
  safeRemove(AUTH_STORAGE_KEYS.user);
  safeRemove(AUTH_STORAGE_KEYS.companyId);
  publish({
    status: 'anonymous',
    user: null,
    companyId: null,
    revocationConfirmed: true,
    logoutError: null,
  });
  if (options.signal !== false) writeSessionSignal('out');
}

export function beginSigningOut(): void {
  probeBlocked = true;
  publish({
    status: 'signing-out',
    user: null,
    companyId: null,
    revocationConfirmed: null,
    logoutError: null,
  });
}

export function markSignOutUnconfirmed(message: string): void {
  probeBlocked = true;
  publish({
    status: 'signing-out',
    user: null,
    companyId: null,
    revocationConfirmed: false,
    logoutError: message,
  });
}

export function markSessionLoading(): void {
  publish({
    status: 'loading',
    user: null,
    companyId: null,
    revocationConfirmed: null,
    logoutError: null,
  });
}

export function markSessionOffline(): void {
  publish({
    status: 'offline',
    user: null,
    companyId: null,
    revocationConfirmed: null,
    logoutError: null,
  });
}

export function markSessionForbidden(): void {
  publish({
    status: 'forbidden',
    user: null,
    companyId: null,
    revocationConfirmed: null,
    logoutError: null,
  });
}

/** Another tab already revoked the session. Do not write localStorage again. */
export function adoptRemoteLogout(): void {
  advanceAuthSessionGeneration();
  probeBlocked = false;
  publish({
    status: 'anonymous',
    user: null,
    companyId: null,
    revocationConfirmed: true,
    logoutError: null,
  });
}

export function setActiveCompany(companyId: string): void {
  const nextId = typeof companyId === 'string' ? companyId.trim() : '';
  if (!nextId) throw new Error('companyId inválido.');
  const user = snapshot.user;
  if (snapshot.status !== 'authenticated' || !user) {
    throw new Error('No hay sesión activa.');
  }
  if (
    !user.memberships.some(
      (membership) =>
        membership.companyId === nextId && membership.companyStatus === 'active',
    )
  ) {
    throw new Error('La compañía no pertenece al usuario autenticado.');
  }
  if (snapshot.companyId === nextId) return;
  safeSet(AUTH_STORAGE_KEYS.companyId, nextId);
  publish({ ...snapshot, companyId: nextId });
  writeSessionSignal('in');
}

function writeSessionSignal(kind: 'in' | 'out'): void {
  safeSet(AUTH_STORAGE_KEYS.sessionSignal, `${kind}:${Date.now()}`);
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
  return () => window.removeEventListener(AUTH_EVENT, listener);
}

export function hasActiveSession(): boolean {
  return snapshot.status === 'authenticated' && Boolean(snapshot.user && snapshot.companyId);
}

export function getActiveMembership(user = getStoredUser()) {
  const companyId = snapshot.companyId;
  if (!user || !companyId) return null;
  return user.memberships.find((membership) => membership.companyId === companyId) ?? null;
}

export function resetClientSession(): void {
  probeBlocked = false;
  snapshot = {
    status: 'anonymous',
    user: null,
    companyId: null,
    revocationConfirmed: null,
    logoutError: null,
  };
}

purgeLegacyJwt();
