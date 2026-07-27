/**
 * Fechas civiles de UI (DD/MM/AAAA) ↔ wire (YYYY-MM-DD).
 * Puro: sin tickets, servicios, companyId ni toasts.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/** Valida un trío civil real (sin usar Date UTC). */
export function isValidCivilDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export function isValidWireCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidCivilDateParts(year, month, day);
}

/** YYYY-MM-DD → DD/MM/AAAA. Vacío o inválido → ''. */
export function formatCivilDateDisplay(wire: string | null | undefined): string {
  if (!wire || typeof wire !== 'string') return '';
  const trimmed = wire.trim();
  if (!isValidWireCivilDate(trimmed)) return '';
  const [year, month, day] = trimmed.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * DD/MM/AAAA → YYYY-MM-DD.
 * Rechaza incompletos, años de 2 dígitos y fechas imposibles.
 */
export function parseCivilDateInput(display: string | null | undefined): string | null {
  if (!display || typeof display !== 'string') return null;
  const trimmed = display.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidCivilDateParts(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Acepta wire YYYY-MM-DD o display DD/MM/AAAA.
 * Usado al comparar drafts y al construir payload.
 */
export function coerceToWireCivilDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidWireCivilDate(trimmed) ? trimmed : null;
  }
  return parseCivilDateInput(trimmed);
}
