/**
 * Exportación de tablas a CSV y Excel sin dependencias externas.
 *
 * - CSV: RFC 4180 (comillas dobles escapadas) + BOM UTF-8 para que Excel
 *   respete los acentos al abrir el archivo directamente.
 * - Excel: SpreadsheetML 2003 (XML). Es un formato nativo de Excel que también
 *   abren LibreOffice, Numbers y Google Sheets, y conserva el tipado numérico
 *   (los totales quedan como números sumables, no como texto).
 */

export type ExportFormat = 'csv' | 'excel';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

interface NormalizedCell {
  text: string;
  number: number | null;
}

function normalizeCell(raw: string | number | null | undefined): NormalizedCell {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { text: String(raw), number: raw };
  }
  if (raw === null || raw === undefined) return { text: '', number: null };
  return { text: String(raw), number: null };
}

function buildMatrix<T>(
  columns: ExportColumn<T>[],
  rows: readonly T[],
): { headers: string[]; body: NormalizedCell[][] } {
  return {
    headers: columns.map((column) => column.header),
    body: rows.map((row) => columns.map((column) => normalizeCell(column.value(row)))),
  };
}

function escapeCsvValue(value: string): string {
  if (/["\r\n,;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv<T>(columns: ExportColumn<T>[], rows: readonly T[]): string {
  const { headers, body } = buildMatrix(columns, rows);
  const lines = [
    headers.map(escapeCsvValue).join(','),
    ...body.map((cells) => cells.map((cell) => escapeCsvValue(cell.text)).join(',')),
  ];
  // BOM (\uFEFF) para que Excel abra el CSV en UTF-8.
  return `\uFEFF${lines.join('\r\n')}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Letra de columna estilo hoja de cálculo (0 -> A, 26 -> AA). */
function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

function sheetCell(cell: NormalizedCell, ref: string): string {
  if (cell.number !== null) {
    return `<c r="${ref}"><v>${cell.number}</v></c>`;
  }
  // Cadenas en línea (inlineStr): evita tener que construir una tabla de strings.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.text)}</t></is></c>`;
}

function buildSheetXml<T>(columns: ExportColumn<T>[], rows: readonly T[]): string {
  const { headers, body } = buildMatrix(columns, rows);
  const headerCells = headers
    .map((header, col) => sheetCell({ text: header, number: null }, `${columnLetter(col)}1`))
    .join('');
  const rowsXml = [
    `<row r="1">${headerCells}</row>`,
    ...body.map((cells, rowIdx) => {
      const rowNumber = rowIdx + 2;
      const cellsXml = cells
        .map((cell, col) => sheetCell(cell, `${columnLetter(col)}${rowNumber}`))
        .join('');
      return `<row r="${rowNumber}">${cellsXml}</row>`;
    }),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

// --- Escritor ZIP mínimo (método "store", sin compresión) para .xlsx ---

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // firma local file header
    lv.setUint16(4, 20, true); // versión requerida
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // compresión = store
    lv.setUint16(10, 0, true); // hora
    lv.setUint16(12, 0x21, true); // fecha (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // tamaño comprimido
    lv.setUint32(22, size, true); // tamaño sin comprimir
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // firma central directory
    cv.setUint16(4, 20, true); // versión creadora
    cv.setUint16(6, 20, true); // versión requerida
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // compresión
    cv.setUint16(12, 0, true); // hora
    cv.setUint16(14, 0x21, true); // fecha
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comentario
    cv.setUint16(34, 0, true); // disco inicial
    cv.setUint16(36, 0, true); // atributos internos
    cv.setUint32(38, 0, true); // atributos externos
    cv.setUint32(42, offset, true); // offset del local header
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // firma end of central directory
  ev.setUint16(4, 0, true); // disco
  ev.setUint16(6, 0, true); // disco con central directory
  ev.setUint16(8, entries.length, true); // entradas en este disco
  ev.setUint16(10, entries.length, true); // total de entradas
  ev.setUint32(12, centralSize, true); // tamaño del central directory
  ev.setUint32(16, offset, true); // offset del central directory
  ev.setUint16(20, 0, true); // longitud del comentario

  const total =
    localParts.reduce((sum, part) => sum + part.length, 0) + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

function buildXlsx<T>(
  columns: ExportColumn<T>[],
  rows: readonly T[],
  sheetName: string,
): Uint8Array {
  const encoder = new TextEncoder();
  // El nombre de hoja no admite ciertos caracteres y se limita a 31.
  const safeSheetName =
    sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Datos';

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  const sheet = buildSheetXml(columns, rows);

  return zipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet) },
  ]);
}

function triggerDownload(content: string | Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Diferir el revoke para no cancelar la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Marca de tiempo `YYYY-MM-DD` para nombrar archivos de forma estable. */
export function exportDateStamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface ExportTableOptions<T> {
  columns: ExportColumn<T>[];
  rows: readonly T[];
  /** Nombre base del archivo, sin extensión. */
  filename: string;
  /** Nombre de la hoja para el archivo de Excel. */
  sheetName?: string;
}

export function exportTable<T>(format: ExportFormat, options: ExportTableOptions<T>): void {
  const { columns, rows, filename, sheetName } = options;
  if (format === 'csv') {
    triggerDownload(
      toCsv(columns, rows),
      `${filename}.csv`,
      'text/csv;charset=utf-8;',
    );
    return;
  }
  triggerDownload(
    buildXlsx(columns, rows, sheetName ?? filename),
    `${filename}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
