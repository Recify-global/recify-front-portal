import { describe, expect, it } from 'vitest';
import { validateInvoicePdfFile } from '@/utils/invoice-file';

describe('validateInvoicePdfFile', () => {
  it('accepts application/pdf', () => {
    const file = new File(['%PDF'], 'cfdi.pdf', { type: 'application/pdf' });
    expect(validateInvoicePdfFile(file)).toEqual({ ok: true });
  });

  it('accepts empty MIME with .pdf extension', () => {
    const file = new File(['%PDF'], 'cfdi.pdf', { type: '' });
    expect(validateInvoicePdfFile(file)).toEqual({ ok: true });
  });

  it('rejects non-pdf extension', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect(validateInvoicePdfFile(file).ok).toBe(false);
  });

  it('rejects empty file', () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' });
    expect(validateInvoicePdfFile(file)).toEqual({
      ok: false,
      message: 'El archivo está vacío.',
    });
  });

  it('rejects oversized file', () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    expect(validateInvoicePdfFile(file).ok).toBe(false);
  });

  it('rejects missing file', () => {
    expect(validateInvoicePdfFile(null).ok).toBe(false);
  });
});
