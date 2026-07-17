import { describe, expect, it } from 'vitest';
import { resolveInvoiceFileUrl } from '@/utils/invoice-display';

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
