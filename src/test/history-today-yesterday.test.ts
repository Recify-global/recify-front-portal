import { describe, expect, it } from 'vitest';
import {
  civilDateInTimeZone,
  dateRangeForPreset,
  detectActivePreset,
  resolveCompanyTimeZone,
  shiftCivilDays,
} from '@/utils/financial-kpis';

describe('Hoy and Ayer civil ranges', () => {
  const now = new Date('2026-07-27T18:00:00.000-06:00');
  const zone = 'America/Mexico_City';

  it('builds Hoy as the civil day of the company timezone', () => {
    expect(civilDateInTimeZone(now, zone)).toBe('2026-07-27');
    expect(dateRangeForPreset('today', now, zone)).toEqual({
      dateFrom: '2026-07-27',
      dateTo: '2026-07-27',
    });
  });

  it('builds Ayer from the same today source via shiftCivilDays', () => {
    const today = civilDateInTimeZone(now, zone);
    expect(shiftCivilDays(today, -1)).toBe('2026-07-26');
    expect(dateRangeForPreset('yesterday', now, zone)).toEqual({
      dateFrom: '2026-07-26',
      dateTo: '2026-07-26',
    });
  });

  it('shares the same helper path for today and yesterday', () => {
    const todayRange = dateRangeForPreset('today', now, zone);
    const yesterdayRange = dateRangeForPreset('yesterday', now, zone);
    expect(yesterdayRange.dateFrom).toBe(shiftCivilDays(todayRange.dateFrom, -1));
    expect(yesterdayRange.dateTo).toBe(yesterdayRange.dateFrom);
    expect(detectActivePreset(todayRange.dateFrom, todayRange.dateTo, now, zone)).toBe('today');
    expect(
      detectActivePreset(yesterdayRange.dateFrom, yesterdayRange.dateTo, now, zone),
    ).toBe('yesterday');
  });

  it('handles month and year boundaries for Ayer', () => {
    expect(dateRangeForPreset('yesterday', new Date('2026-08-01T12:00:00.000-06:00'), zone)).toEqual({
      dateFrom: '2026-07-31',
      dateTo: '2026-07-31',
    });
    expect(dateRangeForPreset('yesterday', new Date('2026-01-01T12:00:00.000-06:00'), zone)).toEqual({
      dateFrom: '2025-12-31',
      dateTo: '2025-12-31',
    });
  });

  it('falls back when timezone is invalid', () => {
    expect(resolveCompanyTimeZone('Not/AZone')).toBe('America/Chihuahua');
    expect(resolveCompanyTimeZone('')).toBe('America/Chihuahua');
  });

  it('does not invent extreme or empty dates for Hoy/Ayer', () => {
    const today = dateRangeForPreset('today', now, zone);
    const yesterday = dateRangeForPreset('yesterday', now, zone);
    expect(today.dateFrom).not.toBe('');
    expect(yesterday.dateFrom).not.toBe('1900-01-01');
    expect(today.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
