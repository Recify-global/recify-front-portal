import type {
  BackendTicket,
  BackendTicketStatus,
  UiTicket,
} from '@/types/ticket';
import {
  formatTicketNotes,
  formatTicketPaymentMethod,
  formatTicketReviewStatus,
  formatTicketType,
  getTicketFolio,
  getTicketImageUrl,
} from '@/utils/ticket-display';

const STATUS_MAP: Record<BackendTicketStatus, UiTicket['estatus']> = {
  processed: 'analizado',
  pending: 'pendiente',
  duplicate: 'pendiente',
  failed: 'error',
};

const CATEGORY_BY_TYPE: Record<BackendTicket['type'], string> = {
  ingreso: 'Otros Ingresos',
  egreso: 'Otros Gastos',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function splitDate(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: 'Sin fecha', hora: '--:--' };
  const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { fecha, hora };
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function normalizePaymentMethod(value: unknown): BackendPaymentMethod {
  const raw = asString(value)?.toLowerCase();
  if (raw === 'card' || raw === 'cash' || raw === 'transfer' || raw === 'other') {
    return raw;
  }
  return 'other';
}

function normalizeStatus(value: unknown): BackendTicketStatus {
  const raw = asString(value)?.toLowerCase();
  if (raw === 'processed' || raw === 'pending' || raw === 'duplicate' || raw === 'failed') {
    return raw;
  }
  return 'processed';
}

// Convierte la forma del backend a la forma visual usada hoy por el UI
// (basada en `src/data/dummy-tickets.ts`). Se mantiene separado de los servicios
// para no acoplar la API a los componentes.
export function mapBackendTicket(t: BackendTicket): UiTicket {
  const { fecha, hora } = splitDate(asString(t.date) ?? '');
  const total = Math.max(0, asNumber(t.amount) ?? 0);
  const subtotalFromApi = asNumber(t.rawData?.subtotal);
  const taxFromApi = asNumber(t.rawData?.tax);
  const subtotal = subtotalFromApi ?? (taxFromApi !== null ? Math.max(0, total - taxFromApi) : total);
  const iva = taxFromApi ?? Math.max(0, total - subtotal);
  const categoria = asString(t.category) ?? CATEGORY_BY_TYPE[t.type] ?? 'Sin categoría';
  const comercio =
    asString(t.rawData?.vendor) ??
    asString((t.rawData as Record<string, unknown> | undefined)?.merchantName) ??
    asString((t.rawData as Record<string, unknown> | undefined)?.merchant) ??
    categoria;
  const moneda =
    asString((t.rawData as Record<string, unknown> | undefined)?.currency) ??
    asString((t.rawData as Record<string, unknown> | undefined)?.moneda) ??
    'MXN';
  const notas = formatTicketNotes(t);
  const imageUrl = getTicketImageUrl(t) ?? undefined;
  const folio = getTicketFolio(t) ?? undefined;

  return {
    id: asString(t._id) ?? 'sin-id',
    comercio,
    folio,
    fecha,
    hora,
    subtotal,
    iva,
    total,
    moneda,
    categoria,
    tipo: formatTicketType(t.type),
    metodoPago: formatTicketPaymentMethod(t.paymentMethod),
    estatus: STATUS_MAP[t.status] ?? 'pendiente',
    reviewStatus: formatTicketReviewStatus(t.reviewStatus),
    notas,
    imagenUrl: imageUrl,
  };
}

export function mapBackendTickets(list: BackendTicket[] | null | undefined): UiTicket[] {
  if (!Array.isArray(list)) return [];
  return list.map(mapBackendTicket);
}

interface PreprocessMapperMeta {
  imageUrl?: string;
  fallbackId?: string;
  ocrText?: string;
}

export function mapPreprocessTicket(
  payload: Record<string, unknown> | null | undefined,
  meta: PreprocessMapperMeta = {},
): UiTicket {
  const raw = payload ?? {};

  const backendLike: BackendTicket = {
    _id: asString(raw.id) ?? asString(raw._id) ?? meta.fallbackId ?? 'ticket-preview',
    companyId: '',
    type: (asString(raw.type) === 'ingreso' ? 'ingreso' : 'egreso') as BackendTicket['type'],
    date:
      asString(raw.date) ??
      asString(raw.fecha) ??
      asString(raw.created_at) ??
      new Date().toISOString(),
    amount: Math.max(0, asNumber(raw.amount) ?? asNumber(raw.total) ?? 0),
    category: asString(raw.category) ?? asString(raw.categoria) ?? undefined,
    paymentMethod: normalizePaymentMethod(raw.paymentMethod ?? raw.metodoPago),
    status: normalizeStatus(raw.status),
    rawData: {
      vendor: asString(raw.vendor) ?? asString(raw.comercio) ?? undefined,
      vendorRFC: asString(raw.vendorRFC) ?? asString(raw.rfc) ?? undefined,
      folio: asString(raw.folio) ?? asString(raw.ticketNumber) ?? undefined,
      subtotal: asNumber(raw.subtotal),
      tax: asNumber(raw.tax) ?? asNumber(raw.iva),
      imageUrl: meta.imageUrl,
      confidence: asNumber(raw.confidence) ?? asNumber(raw.confianza) ?? undefined,
      notes: asString(raw.notes) ?? asString(raw.notas) ?? undefined,
      ocrText: meta.ocrText,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return mapBackendTicket(backendLike);
}
