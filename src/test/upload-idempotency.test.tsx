import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/api/http';
import { useBatchUpload } from '@/hooks/use-batch-upload';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: 'company-a', isAuthenticated: true }),
}));

vi.mock('@/services/upload.service', () => ({
  preprocessTicket: vi.fn(),
  uploadTicket: vi.fn(),
}));

import { preprocessTicket, uploadTicket } from '@/services/upload.service';

const preprocess = vi.mocked(preprocessTicket);
const upload = vi.mocked(uploadTicket);

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  preprocess.mockReset();
  upload.mockReset();
});

afterEach(cleanup);

describe('batch upload keeps one operation key across retries', () => {
  it('reuses the same key after a lost response and does not mint another for a completed file', async () => {
    preprocess.mockResolvedValue({
      ocrText: 'ocr',
      ticket: { documentKind: 'balance' },
    } as Awaited<ReturnType<typeof preprocessTicket>>);
    upload
      .mockRejectedValueOnce(new ApiRequestError('network', 0))
      .mockResolvedValueOnce({
        kind: 'balance',
        imageUrl: 'https://r2.example/signed',
        ocrText: 'ocr',
        balance: { _id: 'balance-1' },
      } as Awaited<ReturnType<typeof uploadTicket>>);

    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 1 }));
    const file = new File(['ticket'], 'ticket.jpg', { type: 'image/jpeg' });

    act(() => {
      expect(result.current.addFiles([file]).added).toBe(1);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('analyzed');
    });
    const operationKey = result.current.items[0]?.operationKey;
    expect(operationKey).toMatch(/^[0-9a-f-]{36}$/i);

    await act(async () => {
      await result.current.saveItem(result.current.items[0].id);
    });
    expect(result.current.items[0]?.status).toBe('error');
    expect(result.current.items[0]?.operationKey).toBe(operationKey);

    act(() => {
      result.current.retryItem(result.current.items[0].id);
    });
    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe('saved');
    });

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0]?.[2].idempotencyKey).toBe(operationKey);
    expect(upload.mock.calls[1]?.[2].idempotencyKey).toBe(operationKey);

    await act(async () => {
      await result.current.saveItem(result.current.items[0].id);
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('keeps a distinct key for a new file in the same batch', () => {
    const { result } = renderHook(() => useBatchUpload({ analyzeConcurrency: 0 }));
    const first = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const second = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    act(() => {
      result.current.addFiles([first, second]);
    });

    expect(result.current.items[0]?.operationKey).not.toBe(result.current.items[1]?.operationKey);
  });
});
