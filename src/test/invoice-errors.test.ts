import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/api/http';
import {
  getInvoiceUploadErrorMessage,
  getInvoiceUserErrorMessage,
  isInvoiceAbortError,
} from '@/utils/invoice-errors';

describe('invoice user errors', () => {
  it('maps status codes to safe messages without raw internals', () => {
    expect(getInvoiceUserErrorMessage(new ApiRequestError('E11000 duplicate', 409), 'x')).toMatch(
      /estado cambió/i,
    );
    expect(getInvoiceUserErrorMessage(new ApiRequestError('stack at mongo', 500), 'x')).toMatch(
      /no está disponible/i,
    );
    expect(getInvoiceUserErrorMessage(new ApiRequestError('forbidden detail', 403), 'x')).toMatch(
      /permiso/i,
    );
    expect(getInvoiceUserErrorMessage(new ApiRequestError('not found path', 404), 'x')).toMatch(
      /no encontramos/i,
    );
    expect(getInvoiceUserErrorMessage(new ApiRequestError('Too many', 429), 'x')).toMatch(/límite/i);
    expect(getInvoiceUserErrorMessage(new ApiRequestError('Failed to fetch', 0), 'x')).toMatch(
      /conexión/i,
    );
  });

  it('hides abort errors', () => {
    const abort = new DOMException('Aborted', 'AbortError');
    expect(isInvoiceAbortError(abort)).toBe(true);
    expect(getInvoiceUserErrorMessage(abort, 'fallback')).toBe('');
  });

  it('upload errors keep known conflict copy without leaking raw message', () => {
    expect(getInvoiceUploadErrorMessage(new ApiRequestError('uuid exists in db', 409))).toMatch(
      /mismo folio fiscal/i,
    );
    expect(getInvoiceUploadErrorMessage(new ApiRequestError('boom', 500))).not.toMatch(/boom/);
  });
});
