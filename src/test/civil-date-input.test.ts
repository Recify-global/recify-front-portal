import { describe, expect, it } from 'vitest';
import {
  coerceToWireCivilDate,
  formatCivilDateDisplay,
  isValidCivilDateParts,
  parseCivilDateInput,
} from '@/utils/civil-date-input';

describe('civil-date-input', () => {
  it('formats and parses round-trip', () => {
    expect(formatCivilDateDisplay('2026-07-27')).toBe('27/07/2026');
    expect(parseCivilDateInput('27/07/2026')).toBe('2026-07-27');
    expect(coerceToWireCivilDate('27/07/2026')).toBe('2026-07-27');
    expect(coerceToWireCivilDate('2026-07-27')).toBe('2026-07-27');
  });

  it('accepts leap day and rejects impossible dates', () => {
    expect(parseCivilDateInput('29/02/2024')).toBe('2024-02-29');
    expect(parseCivilDateInput('29/02/2025')).toBeNull();
    expect(parseCivilDateInput('31/02/2026')).toBeNull();
    expect(parseCivilDateInput('00/07/2026')).toBeNull();
    expect(parseCivilDateInput('27/13/2026')).toBeNull();
    expect(parseCivilDateInput('27/07/26')).toBeNull();
    expect(isValidCivilDateParts(2026, 2, 31)).toBe(false);
  });

  it('rejects incomplete progressive input', () => {
    expect(parseCivilDateInput('2')).toBeNull();
    expect(parseCivilDateInput('27')).toBeNull();
    expect(parseCivilDateInput('27/')).toBeNull();
    expect(parseCivilDateInput('27/07')).toBeNull();
    expect(parseCivilDateInput('27/07/202')).toBeNull();
  });
});
