import { describe, expect, it } from 'vitest';
import {
  civilDateInTimeZone,
  detectActivePreset,
  endOfCivilDayIso,
  isKpiExcludedStatus,
  isValidDateRange,
  last12MonthsRange,
  last30DaysRange,
  paymentMethodKpiFromTop,
  resolveMostUsedPaymentMethod,
  startOfCivilDayIso,
} from '@/utils/financial-kpis';

describe('isKpiExcludedStatus', () => {
  it('includes processed and pending (not excluded)', () => {
    expect(isKpiExcludedStatus('processed')).toBe(false);
    expect(isKpiExcludedStatus('pending')).toBe(false);
  });

  it('excludes duplicate and failed', () => {
    expect(isKpiExcludedStatus('duplicate')).toBe(true);
    expect(isKpiExcludedStatus('failed')).toBe(true);
  });

  it('includes unknown future statuses by default', () => {
    expect(isKpiExcludedStatus('archived')).toBe(false);
    expect(isKpiExcludedStatus('reviewing')).toBe(false);
  });
});

describe('resolveMostUsedPaymentMethod', () => {
  it('returns a single winner with count percentage', () => {
    const result = resolveMostUsedPaymentMethod([
      { paymentMethod: 'card', count: 12 },
      { paymentMethod: 'cash', count: 5 },
      { paymentMethod: 'transfer', count: 3 },
    ]);
    expect(result.kind).toBe('winner');
    expect(result.title).toBe('Tarjeta');
    expect(result.subtitle).toBe('12 movimientos · 60%');
    expect(result.winners).toEqual(['card']);
  });

  it('shows a two-way tie', () => {
    const result = resolveMostUsedPaymentMethod([
      { paymentMethod: 'cash', count: 4 },
      { paymentMethod: 'transfer', count: 4 },
      { paymentMethod: 'card', count: 1 },
    ]);
    expect(result.kind).toBe('tie');
    expect(result.title).toBe('Empate');
    expect(result.subtitle).toBe('Efectivo y Transferencia');
  });

  it('shows a three-way tie', () => {
    const result = resolveMostUsedPaymentMethod([
      { paymentMethod: 'card', count: 2 },
      { paymentMethod: 'cash', count: 2 },
      { paymentMethod: 'transfer', count: 2 },
    ]);
    expect(result.kind).toBe('tie');
    expect(result.subtitle).toBe('Tarjeta, Efectivo y Transferencia');
  });

  it('excludes other and empty from the winner and counts them as unspecified', () => {
    const result = resolveMostUsedPaymentMethod([
      { paymentMethod: 'card', count: 3 },
      { paymentMethod: 'other', count: 10 },
      { paymentMethod: '', count: 2 },
      { paymentMethod: null, count: 1 },
    ]);
    expect(result.kind).toBe('winner');
    expect(result.title).toBe('Tarjeta');
    expect(result.unspecifiedDetail).toBe('13 movimientos sin especificar');
    expect(result.identifiedTotal).toBe(3);
  });

  it('handles only unspecified methods', () => {
    const result = resolveMostUsedPaymentMethod([
      { paymentMethod: 'other', count: 4 },
      { paymentMethod: undefined, count: 1 },
    ]);
    expect(result.kind).toBe('unspecified-only');
    expect(result.title).toBe('Sin especificar');
  });

  it('returns empty when there are no movements', () => {
    const result = resolveMostUsedPaymentMethod([]);
    expect(result.kind).toBe('empty');
    expect(result.title).toBe('Sin movimientos');
  });
});

describe('paymentMethodKpiFromTop', () => {
  it('translates an identified backend winner', () => {
    const result = paymentMethodKpiFromTop({ paymentMethod: 'cash', count: 18 });
    expect(result.kind).toBe('winner');
    expect(result.title).toBe('Efectivo');
    expect(result.subtitle).toBe('18 movimientos');
    expect(result.winners).toEqual(['cash']);
  });

  it('uses singular for a single movement', () => {
    const result = paymentMethodKpiFromTop({ paymentMethod: 'card', count: 1 });
    expect(result.subtitle).toBe('1 movimiento');
  });

  it('translates other as Otro', () => {
    const result = paymentMethodKpiFromTop({ paymentMethod: 'other', count: 4 });
    expect(result.kind).toBe('unspecified-only');
    expect(result.title).toBe('Otro');
    expect(result.unspecifiedCount).toBe(4);
  });

  it('handles unknown methods as unspecified', () => {
    const result = paymentMethodKpiFromTop({ paymentMethod: 'crypto', count: 2 });
    expect(result.kind).toBe('unspecified-only');
    expect(result.title).toBe('Sin especificar');
  });

  it('returns empty when backend sends null', () => {
    const result = paymentMethodKpiFromTop(null);
    expect(result.kind).toBe('empty');
    expect(result.title).toBe('Sin movimientos');
  });

  it('returns empty on non-positive counts', () => {
    expect(paymentMethodKpiFromTop({ paymentMethod: 'card', count: 0 }).kind).toBe('empty');
    expect(paymentMethodKpiFromTop({ paymentMethod: 'card', count: -3 }).kind).toBe('empty');
  });
});

describe('date presets and range', () => {
  it('builds last 30 days including today', () => {
    const now = new Date('2026-07-12T18:00:00.000-06:00');
    const range = last30DaysRange(now);
    expect(range.dateTo).toBe('2026-07-12');
    expect(range.dateFrom).toBe('2026-06-13');
  });

  it('builds last 12 months including today', () => {
    const now = new Date('2026-07-12T18:00:00.000-06:00');
    const range = last12MonthsRange(now);
    expect(range.dateTo).toBe('2026-07-12');
    expect(range.dateFrom).toBe('2025-07-12');
  });

  it('clamps a leap-day annual range to the last valid target day', () => {
    const now = new Date('2024-02-29T12:00:00.000-06:00');
    const range = last12MonthsRange(now);
    expect(range.dateTo).toBe('2024-02-29');
    expect(range.dateFrom).toBe('2023-02-28');
  });

  it('marks dateTo as inclusive end-of-day in Chihuahua', () => {
    expect(endOfCivilDayIso('2026-07-12')).toBe('2026-07-12T23:59:59.999-06:00');
    expect(startOfCivilDayIso('2026-07-12')).toBe('2026-07-12T00:00:00.000-06:00');
  });

  it('rejects inverted ranges', () => {
    expect(isValidDateRange('2026-07-12', '2026-07-01')).toBe(false);
    expect(isValidDateRange('2026-07-01', '2026-07-12')).toBe(true);
  });

  it('detects active presets', () => {
    const now = new Date('2026-07-12T12:00:00.000-06:00');
    const month = last30DaysRange(now);
    expect(detectActivePreset(month.dateFrom, month.dateTo, now)).toBe('last_30_days');
    const year = last12MonthsRange(now);
    expect(detectActivePreset(year.dateFrom, year.dateTo, now)).toBe('last_12_months');
    expect(detectActivePreset('2026-01-01', '2026-01-31', now)).toBe(null);
  });

  it('resolves civil date in America/Chihuahua', () => {
    // 2026-07-13 02:00 UTC = 2026-07-12 20:00 in Chihuahua (UTC-6)
    const date = new Date('2026-07-13T02:00:00.000Z');
    expect(civilDateInTimeZone(date)).toBe('2026-07-12');
  });
});
