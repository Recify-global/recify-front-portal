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

export interface TicketLineItem {
  name: string;
  quantity?: string | number;
  unit?: string;
  unitPrice?: string | number;
  total?: string | number;
}

const NOTE_FALLBACK = 'Sin productos o notas registradas.';
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
const LINE_ITEM_KEYS = [
  'items',
  'lineItems',
  'products',
  'concepts',
  'detalles',
  'productos',
  'conceptos',
  'details',
];
const NESTED_SOURCE_KEYS = ['rawData', 'structured', 'data', 'ticket'];
const GENERATED_TRANSCRIPT_MARKERS = [
  'here is a detailed transcription',
  'here is the transcription',
  'detailed transcription of the items',
  'store name:',
  'location:',
  'quantity | description',
  'quantity|description',
  'unit price | total price',
  'total price',
];
const NON_PRODUCT_TERMS = [
  'store name',
  'location',
  'ubicacion',
  'ubicación',
  'total',
  'subtotal',
  'iva',
  'tax',
  'payment',
  'payment method',
  'metodo de pago',
  'método de pago',
  'efectivo',
  'cash',
  'su cambio',
  'cambio',
  'change',
  'fecha',
  'date',
  'folio',
  'rfc',
  'cajero',
  'cashier',
  'puntos',
  'points',
  'categoria',
  'categoría',
  'status',
  'review',
];

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

function normalizeLooseText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function cleanMarkdownCell(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMarkdownSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

function isNonProductName(value: string): boolean {
  const normalized = normalizeLooseText(value);
  if (!normalized || normalized.length < 2) return true;
  return NON_PRODUCT_TERMS.some((term) => normalized === term || normalized.startsWith(`${term}:`) || normalized.includes(` ${term}:`));
}

function headerKind(value: string): 'quantity' | 'description' | 'unitPrice' | 'total' | null {
  const normalized = normalizeLooseText(value);
  if (['quantity', 'qty', 'cantidad', 'cant'].includes(normalized)) return 'quantity';
  if (['description', 'descripcion', 'descrip', 'producto', 'concepto', 'item', 'articulo', 'articulo/servicio'].includes(normalized)) {
    return 'description';
  }
  if (
    normalized.includes('unit price') ||
    normalized.includes('precio unitario') ||
    normalized === 'p.unit' ||
    normalized === 'p unit' ||
    normalized === 'unitario'
  ) {
    return 'unitPrice';
  }
  if (
    normalized === 'total' ||
    normalized.includes('total price') ||
    normalized.includes('precio total') ||
    normalized.includes('p.total') ||
    normalized.includes('importe')
  ) {
    return 'total';
  }
  return null;
}

export function formatTicketPaymentMethod(value: unknown): string {
  const raw = asCleanString(value)?.toLowerCase();
  if (!raw) return 'No identificado';
  if (raw === 'cash' || raw.includes('efectivo')) return 'Efectivo';
  if (raw === 'credit_card' || raw === 'credito' || raw === 'crédito') return 'Crédito';
  if (raw === 'debit_card' || raw === 'debito' || raw === 'débito') return 'Débito';
  if (raw === 'card' || raw.includes('tarjeta')) return 'Tarjeta';
  if (raw === 'transfer' || raw.includes('transfer')) return 'Transferencia';
  if (raw === 'other') return 'Otro';
  if (raw === 'unknown' || raw === 'no identificado') return 'No identificado';
  return truncate(raw, 80);
}

export function formatTicketType(value: unknown): string {
  const raw = asCleanString(value)?.toLowerCase();
  if (!raw) return 'Gasto';
  if (raw === 'income' || raw === 'ingreso' || raw === 'sale' || raw === 'venta') return 'Ingreso';
  if (raw === 'expense' || raw === 'egreso' || raw === 'gasto' || raw === 'purchase' || raw === 'compra') return 'Gasto';
  return truncate(raw, 80);
}

export function formatTicketDateTime(date: string, time?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return 'Sin fecha';
  const [, year, month, day] = match;
  const validTime = typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)
    ? time
    : null;
  return `${day}/${month}/${year}${validTime ? ` · ${validTime}` : ''}`;
}

export function formatTicketReviewStatus(value: unknown): string {
  const raw = asCleanString(value)?.toLowerCase();
  if (raw === 'revisado' || raw === 'reviewed') return 'Revisado';
  return 'Pendiente de revisión';
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

function getStringKey(record: Record<string, unknown>, keys: string[]): string | null {
  return asCleanString(readFirst(record, keys));
}

function formatQuantity(value: unknown, unitValue: unknown): string | null {
  const quantity = asNumber(value);
  if (quantity === null || quantity <= 0) return null;
  const unit = asCleanString(unitValue);
  const rawQuantity = asCleanString(value);
  if (unit) return `${quantity} ${unit}`;
  return Number.isInteger(quantity) ? `${quantity}x` : rawQuantity ?? String(quantity);
}

function isTechnicalLabel(value: string): boolean {
  return TECHNICAL_KEYS.has(value.toLowerCase().replace(/[\s_-]/g, ''));
}

export function isGeneratedOcrTranscript(text: string): boolean {
  const normalized = normalizeLooseText(text);
  if (!normalized) return false;
  if (GENERATED_TRANSCRIPT_MARKERS.some((marker) => normalized.includes(marker))) return true;

  const pipeCount = (text.match(/\|/g) ?? []).length;
  const hasTableHeaders =
    /quantity|cantidad|qty|cant/i.test(text) &&
    /description|descripci[oó]n|producto|concepto/i.test(text) &&
    /unit price|precio unitario|total price|precio total|importe/i.test(text);

  return pipeCount >= 8 && hasTableHeaders;
}

function parseMarkdownCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cleanMarkdownCell);
}

function findHeaderMap(cells: string[]): Partial<Record<'quantity' | 'description' | 'unitPrice' | 'total', number>> {
  return cells.reduce<Partial<Record<'quantity' | 'description' | 'unitPrice' | 'total', number>>>((acc, cell, index) => {
    const kind = headerKind(cell);
    if (kind && acc[kind] === undefined) acc[kind] = index;
    return acc;
  }, {});
}

function rowToLineItem(
  cells: string[],
  headerMap: Partial<Record<'quantity' | 'description' | 'unitPrice' | 'total', number>>,
): TicketLineItem | null {
  const descriptionIndex = headerMap.description;
  if (descriptionIndex === undefined) return null;

  const name = cleanMarkdownCell(cells[descriptionIndex] ?? '');
  if (!name || isNonProductName(name) || isTechnicalLabel(name)) return null;

  const quantity = headerMap.quantity !== undefined ? cleanMarkdownCell(cells[headerMap.quantity] ?? '') : '';
  const unitPrice = headerMap.unitPrice !== undefined ? cleanMarkdownCell(cells[headerMap.unitPrice] ?? '') : '';
  const total = headerMap.total !== undefined ? cleanMarkdownCell(cells[headerMap.total] ?? '') : '';

  return {
    name,
    quantity: quantity || undefined,
    unitPrice: unitPrice || undefined,
    total: total || unitPrice || undefined,
  };
}

function extractTableRows(text: string): string[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));

  if (rows.length > 0) return rows;

  const tableStart = text.search(/\|\s*(Quantity|Cantidad|Qty|Cant)\s*\|/i);
  if (tableStart < 0) return [];

  const cells = text.slice(tableStart).split('|').map(cleanMarkdownCell);
  const rowsFromInline: string[] = [];
  for (let i = 1; i + 3 < cells.length; i += 4) {
    rowsFromInline.push(`| ${cells.slice(i, i + 4).join(' |')} |`);
  }
  return rowsFromInline;
}

export function extractLineItemsFromText(text: string): TicketLineItem[] {
  const rows = extractTableRows(text);
  if (rows.length < 2) return [];

  let headerMap: Partial<Record<'quantity' | 'description' | 'unitPrice' | 'total', number>> | null = null;
  const items: TicketLineItem[] = [];

  for (const row of rows) {
    const cells = parseMarkdownCells(row);
    if (cells.length < 2 || isMarkdownSeparatorRow(cells)) continue;

    const candidateHeader = findHeaderMap(cells);
    if (candidateHeader.description !== undefined && (candidateHeader.quantity !== undefined || candidateHeader.total !== undefined)) {
      headerMap = candidateHeader;
      continue;
    }

    if (!headerMap) continue;
    const item = rowToLineItem(cells, headerMap);
    if (item && !items.some((existing) => existing.name === item.name && existing.total === item.total)) {
      items.push(item);
    }
  }

  return items;
}

export function formatTicketLineItem(item: unknown): string | null {
  const rawText = asCleanString(item);
  if (rawText) {
    if (isGeneratedOcrTranscript(rawText) || /\|.*\|/.test(rawText) || isNonProductName(rawText)) return null;
    return truncate(cleanLongText(rawText), 80);
  }

  const record = asRecord(item);
  if (!record) return null;

  const name = getStringKey(record, [
    'name',
    'nombre',
    'description',
    'descripcion',
    'concept',
    'concepto',
    'product',
    'producto',
    'item',
    'title',
    'label',
  ]);
  if (!name || isTechnicalLabel(name) || isNonProductName(name)) return null;

  const quantity = formatQuantity(
    readFirst(record, ['quantity', 'qty', 'cantidad']),
    readFirst(record, ['unit', 'unidad', 'units', 'unidades']),
  );
  const price = formatCurrency(readFirst(record, ['total', 'lineTotal', 'importe', 'amount', 'price', 'precio', 'unitPrice', 'precioUnitario']));
  const prefix = quantity ? `${quantity} ` : '';
  const suffix = price ? ` — ${price}` : '';
  return `${prefix}${truncate(name, 70)}${suffix}`;
}

function collectLineItems(value: unknown, items: string[]) {
  const parsedString = asCleanString(value);
  if (parsedString) {
    const parsed = parseJson(parsedString);
    if (parsed) {
      collectLineItems(parsed, items);
      return;
    }
    extractLineItemsFromText(parsedString).forEach((item) => {
      const formatted = formatTicketLineItem(item);
      if (formatted && !items.includes(formatted)) items.push(formatted);
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const formatted = formatTicketLineItem(item);
      if (formatted && !items.includes(formatted)) items.push(formatted);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  for (const key of LINE_ITEM_KEYS) {
    collectLineItems(record[key], items);
  }

  const directConcept = formatTicketLineItem({
    name: readFirst(record, ['concept', 'concepto']),
    amount: readFirst(record, ['price', 'precio', 'amount']),
    quantity: readFirst(record, ['quantity', 'qty', 'cantidad']),
    unit: readFirst(record, ['unit', 'unidad', 'units', 'unidades']),
  });
  if (directConcept && !items.includes(directConcept)) items.push(directConcept);

  for (const key of NESTED_SOURCE_KEYS) {
    collectLineItems(record[key], items);
  }
}

export function getTicketFolio(...sources: unknown[]): string | null {
  for (const source of sources) {
    const normalized = normalizeSource(source);
    if (!normalized) continue;
    const folio = asCleanString(readFirst(normalized, ['folio', 'ticketNumber', 'receiptNumber']));
    if (folio) return folio;
  }
  return null;
}

export function getTicketLineItems(...sources: unknown[]): string[] {
  const items: string[] = [];
  for (const source of sources) {
    const normalized = normalizeSource(source);
    if (normalized) collectLineItems(normalized, items);
  }
  return items;
}

export function getTicketImageUrl(ticket: BackendTicket | null | undefined): string | null {
  if (!ticket) return null;
  const topLevel = asRecord(ticket);
  const rawData = asRecord(ticket.rawData);

  const candidates = [
    topLevel?.imageUrl,
    topLevel?.ticketImageUrl,
    topLevel?.fileUrl,
    topLevel?.receiptUrl,
    topLevel?.publicUrl,
    topLevel?.attachmentUrl,
    rawData?.imageUrl,
    rawData?.ticketImageUrl,
    rawData?.fileUrl,
    rawData?.receiptUrl,
    rawData?.publicUrl,
    rawData?.attachmentUrl,
    rawData?.previewUrl,
  ];

  for (const candidate of candidates) {
    const url = asCleanString(candidate);
    if (url) return url;
  }

  return null;
}

export function getTicketNoteSections(...sources: unknown[]): FormattedTicketNotes {
  const items = getTicketLineItems(...sources);
  const details: TicketNoteSection[] = [];

  items.forEach((item) => {
    pushUnique(details, 'Producto / concepto', item);
  });

  const filteredDetails = details.filter((section) => {
    const key = section.label.toLowerCase();
    return !TECHNICAL_KEYS.has(key) && section.value.length > 0;
  });

  const summary = filteredDetails
    .slice(0, 2)
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
