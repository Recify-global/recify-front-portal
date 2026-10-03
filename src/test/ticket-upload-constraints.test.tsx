import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatchUpload } from '@/hooks/use-batch-upload';
import {
  MAX_TICKET_FILES_PER_BATCH,
  MAX_UPLOAD_FILE_BYTES,
} from '@/utils/upload-file';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: 'company-a' }),
}));

vi.mock('@/services/upload.service', () => ({
  preprocessTicket: vi.fn(),
  uploadTicket: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

describe('Ticket batch upload constraints', () => {
  it('accepts one Ticket and allows removal before adding another', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const first = new File(['ticket'], 'first.jpg', { type: 'image/jpeg' });
    const replacement = new File(['ticket'], 'replacement.png', { type: 'image/png' });

    act(() => {
      expect(result.current.addFiles([first]).added).toBe(1);
    });
    const firstId = result.current.items[0]?.id;
    expect(firstId).toBeTruthy();

    act(() => {
      result.current.removeItem(firstId as string);
      expect(result.current.addFiles([replacement]).added).toBe(1);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.file).toBe(replacement);
  });

  it('accepts at most five Ticket images using the shared limit', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const files = Array.from(
      { length: MAX_TICKET_FILES_PER_BATCH + 1 },
      (_, index) => new File(['ticket'], `ticket-${index + 1}.jpg`, { type: 'image/jpeg' }),
    );

    let added = 0;
    let rejected: { file: File; reason: string }[] = [];
    act(() => {
      const response = result.current.addFiles(files);
      added = response.added;
      rejected = response.rejected;
    });

    expect(result.current.maxFiles).toBe(MAX_TICKET_FILES_PER_BATCH);
    expect(added).toBe(MAX_TICKET_FILES_PER_BATCH);
    expect(result.current.items).toHaveLength(MAX_TICKET_FILES_PER_BATCH);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBe(
      `Máximo ${MAX_TICKET_FILES_PER_BATCH} archivos por lote.`,
    );
  });

  it('rejects an unsupported type and an oversized image before upload', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const unsupported = new File(['text'], 'notes.txt', { type: 'text/plain' });
    const oversized = new File(
      [new Uint8Array(MAX_UPLOAD_FILE_BYTES + 1)],
      'large.jpg',
      { type: 'image/jpeg' },
    );

    let rejected: { file: File; reason: string }[] = [];
    act(() => {
      rejected = result.current.addFiles([unsupported, oversized]).rejected;
    });

    expect(result.current.items).toHaveLength(0);
    expect(rejected.map(({ reason }) => reason)).toEqual([
      'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
      'Supera el máximo de 10 MB.',
    ]);
  });

  it('rejects an empty image before upload', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' });

    let rejected: { file: File; reason: string }[] = [];
    act(() => {
      rejected = result.current.addFiles([empty]).rejected;
    });

    expect(result.current.items).toHaveLength(0);
    expect(rejected[0]?.reason).toBe('El archivo está vacío.');
  });

  it('accepts an image exactly at the 10 MB boundary', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const file = new File(
      [new Uint8Array(MAX_UPLOAD_FILE_BYTES)],
      'max.jpg',
      { type: 'image/jpeg' },
    );

    act(() => {
      expect(result.current.addFiles([file])).toEqual({ added: 1, rejected: [] });
    });
    expect(result.current.items).toHaveLength(1);
  });
});
