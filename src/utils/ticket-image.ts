const SAFE_REMOTE_PROTOCOLS = new Set(['https:', 'http:']);
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'file:', 'ftp:']);
/** Solo tokens de sesión explícitos; las firmas de storage (p. ej. X-Amz-Signature) son válidas. */
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'auth',
  'authorization',
  'jwt',
  'token',
]);

function apiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  const trimmed = raw?.trim().replace(/\/$/, '') ?? '';
  return trimmed || null;
}

function hasSensitiveCredentials(url: URL): boolean {
  if (url.username || url.password) return true;
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

/**
 * Normaliza una referencia de imagen sin inventar rutas.
 *
 * - Acepta `blob:` para previews locales.
 * - Acepta `https:` y `http:` (este último necesario en desarrollo).
 * - Resuelve rutas relativas únicamente contra `VITE_API_URL`.
 * - Rechaza credenciales y tokens conocidos dentro de la URL.
 */
export function resolveTicketImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.startsWith('//')) return null;

  if (raw.startsWith('blob:')) {
    return raw;
  }

  try {
    const absolute = new URL(raw);
    if (BLOCKED_PROTOCOLS.has(absolute.protocol)) return null;
    if (!SAFE_REMOTE_PROTOCOLS.has(absolute.protocol)) return null;
    if (absolute.protocol === 'http:' && !import.meta.env.DEV) return null;
    if (hasSensitiveCredentials(absolute)) return null;
    // Conservar la cadena original para no alterar query firmada (R2/S3).
    return raw;
  } catch {
    const base = apiBaseUrl();
    if (!base || !raw.startsWith('/') || raw.startsWith('//')) return null;
    try {
      const resolved = new URL(raw, `${base}/`);
      if (BLOCKED_PROTOCOLS.has(resolved.protocol)) return null;
      if (!SAFE_REMOTE_PROTOCOLS.has(resolved.protocol)) return null;
      if (resolved.protocol === 'http:' && !import.meta.env.DEV) return null;
      if (hasSensitiveCredentials(resolved)) return null;
      return resolved.toString();
    } catch {
      return null;
    }
  }
}

/** Prioriza la URL firmada del listado sobre daily-report en caché. */
export function mergeTicketImageUrl(
  ticket: { imageUrl?: string | null } | null | undefined,
  dailyTicket: { imageUrl?: string | null } | null | undefined,
): string | null | undefined {
  return ticket?.imageUrl ?? dailyTicket?.imageUrl;
}

export interface TicketImageSource {
  ticketId: string;
  companyId: string;
  imageUrl?: string | null;
}

/**
 * El detalle remoto tiene prioridad; el listado solo puede ser fallback si
 * pertenece al mismo ticket y compañía activa.
 */
export function selectTicketImageUrl(
  activeCompanyId: string | null | undefined,
  selectedTicketId: string | null | undefined,
  detail: TicketImageSource | null | undefined,
  listItem: TicketImageSource | null | undefined,
): string | null {
  if (!activeCompanyId || !selectedTicketId) return null;

  const belongsToContext = (source: TicketImageSource | null | undefined) =>
    Boolean(
      source &&
        source.companyId === activeCompanyId &&
        source.ticketId === selectedTicketId,
    );

  if (belongsToContext(detail)) {
    const detailUrl = resolveTicketImageUrl(detail?.imageUrl);
    if (detailUrl) return detailUrl;
  }

  if (belongsToContext(listItem)) {
    return resolveTicketImageUrl(listItem?.imageUrl);
  }

  return null;
}
