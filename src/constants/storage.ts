/**
 * Claves de almacenamiento usadas por la app en localStorage.
 *
 * Cualquier módulo que necesite leer/escribir sesión debe importar estas claves
 * en lugar de usar strings literales. Mantener un único punto de verdad evita
 * typos silenciosos y facilita una migración futura (ej. a sessionStorage o
 * cookies HttpOnly).
 */
export const STORAGE_KEYS = {
  authToken: 'recify.token',
  authUser: 'recify.user',
  companyId: 'recify.companyId',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const STORAGE_EVENTS = {
  authChanged: 'recify:auth-changed',
} as const;
