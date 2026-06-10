import type { BackendTicket } from '@/types/ticket';

export interface TicketNoteSection {
  label: string;
  value: string;
}

export interface FormattedTicketNotes {
  summary?: string;
  details: TicketNoteSection[];
  fallback: string;
}

const NOTE_FALLBACK = 'Sin notas registradas.';
const OCR_LIMIT = 220;
const TEXT_LIMIT = 180;
const TECHNICAL_KEYS = new Set([
  '_id',
  'id',
  'companyid',
  'userid',
  'ticketid',
  'sourceid',
  'rawdata',
  'metadata',
  'internal',
  'stack',
  'error',
  'confidence',
  'confidencescore',
  'confianza',
  'imageurl',
  'previewurl',
  'fileurl',
  'receipturl',
  'publicurl',
  'attachmenturl',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asCleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return null;
  }
  return trimmed;
}

function isLikelyJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function truncate(value: string, max = TEXT_LIMIT): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function cleanLongText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCurrency(value: unknown): string | null {
  const amount = asNumber(value);
  if (amount === null) return null;
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: unknown): string | null {
  const raw = asCleanString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return truncate(raw, 60);
  return new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function normalizePaymentMethod(value: unknown): string | null {
  const raw = asCleanString(value)?.toLowerCase();
  if (!raw) return null;
  if (raw === 'cash' || raw.includes('efectivo')) return 'Efectivo';
  if (raw === 'card' || raw === 'credit_card' || raw === 'debit_card' || raw.includes('tarjeta')) return 'Tarjeta';
  if (raw === 'transfer' || raw.includes('transfer')) return 'Transferencia';
  if (raw === 'other') return 'Otro';
  if (raw === 'unknown') return 'No identificado';
  return truncate(raw, 80);
}

function normalizeType(value: unknown): string | null {
  const raw = asCleanString(value)?.toLowerCase();
  if (!raw) return null;
  if (raw === 'income' || raw === 'ingreso') return 'Ingreso';
  if (raw === 'expense' || raw === 'egreso') return 'Egreso';
  if (raw === 'sale' || raw === 'venta') return 'Venta';
  if (raw === 'purchase' || raw === 'compra') return 'Compra';
  return truncate(raw, 80);
}

function normalizeStatus(value: unknown): string | null {
  const raw = asCleanString(value)?.toLowerCase();
  if (!raw) return null;
  if (raw === 'pending' || raw === 'pendiente') return 'Pendiente';
  if (raw === 'processed' || raw === 'reviewed' || raw === 'revisado') return 'Revisado';
  if (raw === 'approved' || raw === 'aprobado') return 'Aprobado';
  if (raw === 'rejected' || raw === 'rechazado') return 'Rechazado';
  if (raw === 'failed' || raw === 'error') return 'Error';
  if (raw === 'duplicate' || raw === 'duplicado') return 'Duplicado';
  return truncate(raw, 80);
}

function parseJson(value: string): unknown | null {
  if (!isLikelyJson(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pushUnique(sections: TicketNoteSection[], label: string, value: string | null | undefined) {
  const clean = asCleanString(value);
  if (!clean) return;
  if (sections.some((section) => section.label === label && section.value === clean)) return;
  sections.push({ label, value: clean });
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return undefined;
}

function normalizeSource(source: unknown): Record<string, unknown> | null {
  const note = asCleanString(source);
  if (note) {
    const parsed = parseJson(note);
    return asRecord(parsed) ?? { notes: note };
  }

  const record = asRecord(source);
  if (!record) return null;
  const rawData = asRecord(record.rawData);
  return rawData ? { ...record, ...rawData } : record;
}

function summarizeItems(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items = value
    .slice(0, 3)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return asCleanString(item);
      const name = asCleanString(record.name ?? record.description ?? record.concept ?? record.product);
      const amount = formatCurrency(record.amount ?? record.total ?? record.price);
      if (name && amount) return `${truncate(name, 40)} (${amount})`;
      return name ? truncate(name, 50) : amount;
    })
    .filter(Boolean) as string[];
  if (items.length === 0) return null;
  const suffix = value.length > 3 ? ` y ${value.length - 3} más` : '';
  return `${items.join(', ')}${suffix}`;
}

function collectFromRecord(record: Record<string, unknown>, sections: TicketNoteSection[]) {
  pushUnique(sections, 'Comercio', asCleanString(readFirst(record, ['vendor', 'vendorName', 'merchant', 'merchantName', 'store', 'comercio'])));
  pushUnique(sections, 'RFC', asCleanString(readFirst(record, ['vendorRFC', 'rfc'])));
  pushUnique(sections, 'Folio', asCleanString(readFirst(record, ['folio', 'ticketNumber', 'receiptNumber'])));
  pushUnique(sections, 'Fecha', formatDate(readFirst(record, ['date', 'fecha'])));
  pushUnique(sections, 'Hora', asCleanString(readFirst(record, ['time', 'hora'])));
  pushUnique(sections, 'Subtotal', formatCurrency(readFirst(record, ['subtotal'])));
  pushUnique(sections, 'IVA', formatCurrency(readFirst(record, ['tax', 'iva'])));
  pushUnique(sections, 'Total', formatCurrency(readFirst(record, ['amount', 'total'])));
  pushUnique(sections, 'Moneda', asCleanString(readFirst(record, ['currency', 'moneda'])));
  pushUnique(sections, 'Tipo', normalizeType(readFirst(record, ['type', 'tipo'])));
  pushUnique(sections, 'Categoría', asCleanString(readFirst(record, ['category', 'categoria'])));
  pushUnique(sections, 'Método de pago', normalizePaymentMethod(readFirst(record, ['paymentMethod', 'metodoPago'])));
  pushUnique(sections, 'Estado', normalizeStatus(readFirst(record, ['status', 'estatus'])));
  pushUnique(sections, 'Revisión', normalizeStatus(readFirst(record, ['reviewStatus'])));
  pushUnique(sections, 'Conceptos', summarizeItems(readFirst(record, ['items', 'conceptos', 'lineItems'])));

  const note = asCleanString(readFirst(record, ['notes', 'notas', 'description', 'concept']));
  if (note) {
    const parsed = parseJson(note);
    if (asRecord(parsed)) {
      collectFromRecord(parsed as Record<string, unknown>, sections);
    } else {
      pushUnique(sections, 'Nota', truncate(cleanLongText(note)));
    }
  }

  const ocr = asCleanString(readFirst(record, ['ocrText', 'text', 'rawText']));
  if (ocr) pushUnique(sections, 'Texto detectado', truncate(cleanLongText(ocr), OCR_LIMIT));
}

export function getTicketImageUrl(ticket: BackendTicket | null | undefined): string | null {
  if (!ticket) return null;
  const topLevel = asRecord(ticket);
  const rawData = asRecord(ticket.rawData);

  const candidates = [
    rawData?.imageUrl,
    rawData?.ticketImageUrl,
    rawData?.fileUrl,
    rawData?.receiptUrl,
    rawData?.publicUrl,
    rawData?.attachmentUrl,
    rawData?.previewUrl,
    topLevel?.imageUrl,
    topLevel?.ticketImageUrl,
    topLevel?.fileUrl,
    topLevel?.receiptUrl,
    topLevel?.publicUrl,
    topLevel?.attachmentUrl,
  ];

  for (const candidate of candidates) {
    const url = asCleanString(candidate);
    if (url) return url;
  }

  return null;
}

export function getTicketNoteSections(...sources: unknown[]): FormattedTicketNotes {
  const details: TicketNoteSection[] = [];

  for (const source of sources) {
    const normalized = normalizeSource(source);
    if (!normalized) continue;
    collectFromRecord(normalized, details);
  }

  const filteredDetails = details.filter((section) => {
    const key = section.label.toLowerCase();
    return !TECHNICAL_KEYS.has(key) && section.value.length > 0;
  });

  const summary = filteredDetails
    .filter((section) => ['Comercio', 'Folio', 'Total'].includes(section.label))
    .slice(0, 3)
    .map((section) => `${section.label}: ${section.value}`)
    .join(' · ');

  return {
    summary: summary || undefined,
    details: filteredDetails,
    fallback: NOTE_FALLBACK,
  };
}

export function formatTicketNotes(ticket: BackendTicket | null | undefined): string {
  const formatted = getTicketNoteSections(ticket);
  if (formatted.summary) return formatted.summary;
  const firstDetail = formatted.details[0];
  if (firstDetail) {
    return `${firstDetail.label}: ${firstDetail.value}`;
  }
  return formatted.fallback;
}
