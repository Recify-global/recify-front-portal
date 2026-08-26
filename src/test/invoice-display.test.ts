import { describe, expect, it } from 'vitest';
import {
  formatInvoiceDate,
  formatInvoiceUuid,
  invoiceCivilDateKey,
  invoiceUuidSearchText,
  resolveInvoiceFileUrl,
} from '@/utils/invoice-display';

describe('invoice file URL safety', () => {
  it('accepts only absolute HTTPS URLs', () => {
    expect(resolveInvoiceFileUrl('https://files.example/invoice.pdf')).toBe(
      'https://files.example/invoice.pdf',
    );
    expect(resolveInvoiceFileUrl('http://files.example/invoice.pdf')).toBeNull();
    expect(resolveInvoiceFileUrl('javascript:alert(1)')).toBeNull();
    expect(resolveInvoiceFileUrl('data:application/pdf;base64,AA==')).toBeNull();
    expect(resolveInvoiceFileUrl('/uploads/invoice.pdf')).toBeNull();
    expect(resolveInvoiceFileUrl(null)).toBeNull();
  });
});

describe('invoice UUID display and search', () => {
  it('formats valid UUID', () => {
    expect(formatInvoiceUuid('AAAA-BBBB')).toBe('AAAA-BBBB');
  });

  it('formats null/undefined/empty safely', () => {
    expect(formatInvoiceUuid(null)).toBe('Sin folio fiscal');
    expect(formatInvoiceUuid(undefined)).toBe('Sin folio fiscal');
    expect(formatInvoiceUuid('   ')).toBe('Sin folio fiscal');
  });

  it('search haystack is empty for null UUID and does not throw', () => {
    expect(invoiceUuidSearchText(null)).toBe('');
    expect(invoiceUuidSearchText(undefined)).toBe('');
    expect(invoiceUuidSearchText('AbC')).toBe('abc');
    expect(invoiceUuidSearchText(null).includes('abc')).toBe(false);
  });
});

describe('invoice civil dates by company timezone', () => {
  // 2026-07-14T05:30:00Z is still 13 Jul evening in Chihuahua (UTC-6),
  // but already 14 Jul morning in UTC.
  const nearMidnightUtc = '2026-07-14T05:30:00.000Z';

  it('formats with America/Chihuahua', () => {
    expect(formatInvoiceDate(nearMidnightUtc, 'America/Chihuahua')).toMatch(/13/);
    expect(invoiceCivilDateKey(nearMidnightUtc, 'America/Chihuahua')).toBe('2026-07-13');
  });

  it('formats with UTC', () => {
    expect(invoiceCivilDateKey(nearMidnightUtc, 'UTC')).toBe('2026-07-14');
  });

  it('formats with America/Mexico_City', () => {
    expect(invoiceCivilDateKey(nearMidnightUtc, 'America/Mexico_City')).toBe('2026-07-13');
  });
});
