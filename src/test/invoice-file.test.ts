import { describe, expect, it } from 'vitest';
import { validateInvoicePdfFile } from '@/utils/invoice-file';
import { MAX_UPLOAD_FILE_BYTES } from '@/utils/upload-file';

describe('validateInvoicePdfFile', () => {
  it('accepts a real PDF declared as application/pdf', async () => {
    const file = new File(['%PDF-1.7'], 'cfdi.pdf', { type: 'application/pdf' });
    await expect(validateInvoicePdfFile(file)).resolves.toEqual({ ok: true });
  });

  it.each(['', 'application/octet-stream'])(
    'accepts a real PDF with generic browser MIME %j',
    async (type) => {
      const file = new File(['%PDF-1.7'], 'cfdi.pdf', { type });
      await expect(validateInvoicePdfFile(file)).resolves.toEqual({ ok: true });
    },
  );

  it('does not trust a .pdf extension without PDF content', async () => {
    const file = new File(['MZ executable'], 'malware.pdf', { type: '' });
    const result = await validateInvoicePdfFile(file);
    expect(result).toEqual({
      ok: false,
      message: 'El contenido del archivo no corresponde a un PDF válido.',
    });
  });

  it('rejects an incorrect declared MIME', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect((await validateInvoicePdfFile(file)).ok).toBe(false);
  });

  it('rejects empty file', async () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' });
    await expect(validateInvoicePdfFile(file)).resolves.toEqual({
      ok: false,
      message: 'El archivo está vacío.',
    });
  });

  it('accepts a PDF exactly at the 10 MB boundary', async () => {
    const content = new Uint8Array(MAX_UPLOAD_FILE_BYTES);
    content.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const file = new File([content], 'max.pdf', { type: 'application/pdf' });
    await expect(validateInvoicePdfFile(file)).resolves.toEqual({ ok: true });
  });

  it('rejects oversized file', async () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_FILE_BYTES + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    expect((await validateInvoicePdfFile(file)).ok).toBe(false);
  });

  it('rejects missing file', async () => {
    expect((await validateInvoicePdfFile(null)).ok).toBe(false);
  });
});
