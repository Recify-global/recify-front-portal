import type { ApiEnvelope, ApiValidationIssue } from '@/types/api';
import { getStoredToken } from '@/auth/storage';
import {
  isAuthSessionClosing,
  terminateAuthSession,
} from '@/auth/session-cleanup';

const API_PREFIX = '/api/v1';

function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

function buildUrl(path: string): string {
  const base = resolveBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${API_PREFIX}${normalized}`;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly issues: ApiValidationIssue[];

  constructor(message: string, status: number, issues: ApiValidationIssue[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.issues = issues;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path);
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    body = JSON.stringify(opts.body);
  }

  const authEnabled = opts.auth !== false;
  if (authEnabled && isAuthSessionClosing()) {
    throw new ApiRequestError('Tu sesión ya no está activa.', 401);
  }

  let sentToken: string | null = null;
  if (authEnabled) {
    sentToken = getStoredToken();
    if (sentToken) headers['Authorization'] = `Bearer ${sentToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    throw new ApiRequestError(
      err instanceof Error ? err.message : 'Network error',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  let parsed: ApiEnvelope<T> | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as ApiEnvelope<T>;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    // Un 401 usa el mismo cleanup idempotente que el logout manual.
    // Un 403 conserva la sesión: falta de permisos no equivale a expiración.
    if (response.status === 401 && authEnabled && sentToken) {
      await terminateAuthSession();
    }

    const message = parsed?.message ?? `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status, parsed?.errors ?? []);
  }

  return (parsed?.data ?? (parsed as unknown as T)) as T;
}

export const httpClient = {
  request: apiRequest,
};
