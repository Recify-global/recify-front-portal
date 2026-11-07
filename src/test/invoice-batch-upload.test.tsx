import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/api/http';
import { InvoiceBatchUploadDialog } from '@/components/recify/InvoiceBatchUploadDialog';
import { useInvoiceBatchUpload } from '@/hooks/use-invoice-batch-upload';
import type { BackendInvoice } from '@/types/invoice';
import { MAX_INVOICE_FILES_PER_BATCH, MAX_UPLOAD_FILE_BYTES } from '@/utils/upload-file';

const auth = vi.hoisted(() => ({ companyId: 'company-a' as string | null }));
const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: auth.companyId, isAuthenticated: true }),
}));

vi.mock('@/api/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/http')>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function pdfFile(name: string, bytes: BlobPart = PDF_BYTES, type = 'application/pdf') {
  return new File([bytes], name, { type });
}

function invoice(id: string): BackendInvoice {
  return {
    _id: id,
    uuid: null,
    type: 'egreso',
    issuerRfc: null,
    issuerName: 'Emisor',
    receiverRfc: null,
    receiverName: null,
    date: '2026-10-12T06:00:00.000Z',
    subtotal: null,
    tax: null,
    total: 100,
    paymentForm: null,
    paymentMethod: null,
    fileUrl: `https://files.example/${id}.pdf`,
    ticketId: null,
    matchStatus: 'unmatched',
    matchCandidates: [],
    created_at: '2026-10-12T06:00:00.000Z',
    updated_at: '2026-10-12T06:00:00.000Z',
  };
}

function savedResponse(id: string) {
  return {
    fileUrl: `https://files.example/${id}.pdf`,
    ocrText: 'cfdi',
    invoice: invoice(id),
    match: { status: 'unmatched', ticket: null, candidates: [] },
  };
}

beforeEach(() => {
  auth.companyId = 'company-a';
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue(savedResponse('invoice-1'));
});

afterEach(cleanup);

describe('invoice batch selection', () => {
  it('keeps one selected PDF pending and does not upload it', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    const file = pdfFile('one.pdf');

    await act(async () => {
      await expect(result.current.addFiles([file])).resolves.toEqual({ added: 1, rejected: [] });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('pending');
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it('selects several PDFs and removes one before upload', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    const first = pdfFile('first.pdf');
    const second = pdfFile('second.pdf');

    await act(async () => {
      await result.current.addFiles([first, second]);
    });
    const firstId = result.current.items[0]?.id;

    act(() => {
      result.current.removeItem(firstId as string);
    });

    expect(result.current.items.map((item) => item.file.name)).toEqual(['second.pdf']);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it('rejects a sixth file, a non-PDF, an oversized PDF and a duplicate', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    const files = Array.from({ length: MAX_INVOICE_FILES_PER_BATCH + 1 }, (_, index) =>
      pdfFile(`invoice-${index + 1}.pdf`),
    );

    let rejected: { reason: string }[] = [];
    await act(async () => {
      rejected = (await result.current.addFiles(files)).rejected;
    });

    expect(result.current.items).toHaveLength(MAX_INVOICE_FILES_PER_BATCH);
    expect(rejected.map((item) => item.reason)).toEqual([
      `Máximo ${MAX_INVOICE_FILES_PER_BATCH} archivos por lote.`,
    ]);

    const ids = result.current.items.map((item) => item.id);
    act(() => {
      ids.forEach((id) => result.current.removeItem(id));
    });

    const kept = pdfFile('kept.pdf');
    const duplicate = kept;
    const invalid = pdfFile('notes.txt', 'hola', 'text/plain');
    const oversized = pdfFile('large.pdf', new Uint8Array(MAX_UPLOAD_FILE_BYTES + 1));
    await act(async () => {
      await result.current.addFiles([kept]);
      rejected = (await result.current.addFiles([duplicate, invalid, oversized])).rejected;
    });

    expect(rejected.map((item) => item.reason)).toEqual([
      'Archivo duplicado en el lote.',
      'Solo se admiten archivos PDF de CFDI (máx. 10 MB).',
      'El archivo supera el máximo de 10 MB.',
    ]);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});

describe('invoice batch upload', () => {
  it('uploads every selected PDF through the single-file endpoint without Authorization', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    const files = [pdfFile('a.pdf'), pdfFile('b.pdf')];
    mocks.apiRequest
      .mockResolvedValueOnce(savedResponse('invoice-a'))
      .mockResolvedValueOnce(savedResponse('invoice-b'));

    await act(async () => {
      await result.current.addFiles(files);
    });
    await act(async () => {
      const response = await result.current.uploadAll();
      expect(response.saved.map((entry) => entry.invoice._id)).toEqual(['invoice-a', 'invoice-b']);
      expect(response.failed).toBe(0);
    });

    expect(result.current.items.every((item) => item.status === 'saved')).toBe(true);
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    for (const [index, file] of files.entries()) {
      const [path, options] = mocks.apiRequest.mock.calls[index];
      expect(path).toBe('/companies/company-a/upload/invoice');
      expect(options.method).toBe('POST');
      expect(options.headers).toBeUndefined();
      expect(Array.from((options.formData as FormData).keys())).toEqual(['file']);
      expect(options.formData.get('file')).toBe(file);
    }
  });

  it('marks every file as error when the server rejects them', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    mocks.apiRequest.mockRejectedValue(new ApiRequestError('Invalid PDF', 400));

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf')]);
      const response = await result.current.uploadAll();
      expect(response.saved).toEqual([]);
      expect(response.failed).toBe(2);
    });

    expect(result.current.items.map((item) => item.status)).toEqual(['error', 'error']);
    expect(result.current.items[0]?.error).toBe('El archivo no es un PDF válido.');
  });

  it('keeps a confirmed invoice when another file fails', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload({ uploadConcurrency: 1 }));
    mocks.apiRequest
      .mockResolvedValueOnce(savedResponse('invoice-a'))
      .mockRejectedValueOnce(new ApiRequestError('duplicate', 409));

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf')]);
      const response = await result.current.uploadAll();
      expect(response.saved).toHaveLength(1);
      expect(response.failed).toBe(1);
    });

    expect(result.current.items.map((item) => item.status)).toEqual(['saved', 'error']);
    expect(result.current.items[1]?.error).toMatch(/folio fiscal/);
  });

  it('does not start a second upload while the first is running', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    let release: (value: unknown) => void = () => undefined;
    mocks.apiRequest.mockImplementation(
      () => new Promise((resolve) => {
        release = resolve;
      }),
    );

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf')]);
    });

    let second: { alreadyRunning: boolean } | undefined;
    let first: Promise<unknown> = Promise.resolve();
    await act(async () => {
      first = result.current.uploadAll();
      second = await result.current.uploadAll();
    });

    expect(second?.alreadyRunning).toBe(true);
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(savedResponse('invoice-a'));
      await first;
    });
    expect(result.current.items[0]?.status).toBe('saved');
  });

  it('reports an unconfirmed network failure and does not retry by itself', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    mocks.apiRequest.mockRejectedValue(new ApiRequestError('Failed to fetch', 0));

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf')]);
      await result.current.uploadAll();
    });

    expect(result.current.items[0]).toMatchObject({
      status: 'error',
      unconfirmed: true,
      error: 'No se pudo confirmar si la factura se guardó. Revisa el historial antes de reintentar.',
    });
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryItem(result.current.items[0]?.id as string);
    });
    expect(result.current.items[0]?.status).toBe('pending');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
  });

  it('does not mark an unexpected response as saved', async () => {
    const { result } = renderHook(() => useInvoiceBatchUpload());
    mocks.apiRequest.mockResolvedValue({ ocrText: 'incomplete' });

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf')]);
      const response = await result.current.uploadAll();
      expect(response.saved).toEqual([]);
      expect(response.failed).toBe(1);
    });

    expect(result.current.items[0]?.status).toBe('error');
    expect(result.current.items[0]?.unconfirmed).toBe(true);
  });

  it('stops the queue after a session error and ignores a late response from another company', async () => {
    const { result, rerender } = renderHook(() => useInvoiceBatchUpload({ uploadConcurrency: 1 }));
    let release: (value: unknown) => void = () => undefined;
    mocks.apiRequest
      .mockRejectedValueOnce(new ApiRequestError('Unauthorized', 401))
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          release = resolve;
        }),
      );

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf')]);
      const response = await result.current.uploadAll();
      expect(response.failed).toBe(1);
    });

    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(result.current.items.map((item) => item.status)).toEqual(['error', 'pending']);

    mocks.apiRequest.mockImplementation(
      () => new Promise((resolve) => {
        release = resolve;
      }),
    );
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.uploadAll();
    });
    await waitFor(() => expect(result.current.items[1]?.status).toBe('uploading'));

    auth.companyId = 'company-b';
    rerender();
    expect(result.current.items).toEqual([]);

    await act(async () => {
      release(savedResponse('late'));
      await pending;
    });
    expect(result.current.items).toEqual([]);
    expect(mocks.apiRequest.mock.calls.some((call) => String(call[0]).includes('company-b'))).toBe(false);
  });
});

describe('invoice batch dialog', () => {
  function renderDialog() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return render(<InvoiceBatchUploadDialog open onOpenChange={vi.fn()} />, { wrapper });
  }

  it('uses a multiple PDF input and waits for confirmation before uploading', async () => {
    renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    expect(input.accept).toContain('pdf');

    fireEvent.change(input, {
      target: { files: [pdfFile('a.pdf'), pdfFile('b.pdf')] },
    });

    expect(await screen.findByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(mocks.apiRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar a.pdf' }));
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();

    mocks.apiRequest.mockResolvedValueOnce(savedResponse('invoice-b'));
    fireEvent.click(screen.getByRole('button', { name: 'Subir facturas (1)' }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Completada')).toBeInTheDocument();
  });
});
