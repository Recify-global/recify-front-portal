import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from '@/pages/UploadPage';
import type { BackendTicket } from '@/types/ticket';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  preprocess: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  resetPreprocess: vi.fn(),
  resetUpload: vi.fn(),
  resetUpdate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    token: 'test-token',
    companyId: mocks.companyId,
  }),
}));

vi.mock('@/hooks/use-upload-ticket', () => ({
  usePreprocessTicket: () => ({
    mutateAsync: mocks.preprocess,
    isPending: false,
    reset: mocks.resetPreprocess,
  }),
  useUploadTicket: () => ({
    mutateAsync: mocks.upload,
    isPending: false,
    reset: mocks.resetUpload,
  }),
}));

vi.mock('@/hooks/use-tickets', () => ({
  useUpdateDashboardTicket: () => ({
    mutateAsync: mocks.update,
    isPending: false,
    reset: mocks.resetUpdate,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: mocks.toastWarning,
  },
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/recify/CameraCaptureDialog', () => ({
  CameraCaptureDialog: () => null,
}));

vi.mock('@/components/recify/BatchUploadDialog', () => ({
  BatchUploadDialog: () => null,
}));

vi.mock('@/components/recify/TicketScanAnimation', () => ({
  TicketScanAnimation: () => <span>Analizando imagen</span>,
}));

const preprocessTicket = {
  vendor: 'Comercio A',
  type: 'egreso',
  date: '2026-07-13T18:00:00.000Z',
  amount: 100,
  category: 'Restaurantes',
  paymentMethod: 'card',
  status: 'processed',
  reviewStatus: 'revisado',
  rawData: {
    products: [{ name: 'Café seguro', total: 100 }],
    notes: 'Nota conservada',
  },
};

const persistedTicket: BackendTicket = {
  _id: 'ticket-created-in-a',
  companyId: 'company-a',
  vendor: 'OCR persistido',
  type: 'egreso',
  date: '2026-07-13T18:00:00.000Z',
  amount: 100,
  category: 'Restaurantes',
  paymentMethod: 'card',
  status: 'processed',
  reviewStatus: 'pendiente',
  rawData: {
    products: [{ name: 'Café seguro', total: 100 }],
    notes: 'Nota conservada',
  },
  created_at: '2026-07-13T18:00:00.000Z',
  updated_at: '2026-07-13T18:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function uploadFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['ticket'], 'ticket.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

async function waitForAnalyzed() {
  await screen.findByRole('button', { name: 'Guardar ticket' });
}

beforeEach(() => {
  mocks.companyId = 'company-a';
  vi.clearAllMocks();
  mocks.preprocess.mockResolvedValue({
    ticket: preprocessTicket,
    ocrText: 'Café seguro',
  });
  mocks.upload.mockResolvedValue({
    ticket: persistedTicket,
    imageUrl: '/images/ticket-a.png',
    ocrText: 'Café seguro',
  });
  mocks.update.mockResolvedValue({
    ...persistedTicket,
    vendor: 'Comercio A',
    reviewStatus: 'pendiente',
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:ticket-preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('UploadPage tenant isolation', () => {
  it('keeps the normal upload flow working under React StrictMode', async () => {
    render(
      <StrictMode>
        <UploadPage />
      </StrictMode>,
    );

    uploadFile();
    await waitForAnalyzed();

    expect(screen.getAllByText('Comercio A').length).toBeGreaterThan(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Ticket analizado correctamente.');
  });

  it('uses company A through preprocess, upload, PATCH and prevents double save', async () => {
    render(<UploadPage />);
    const file = uploadFile();
    await waitForAnalyzed();

    expect(mocks.preprocess).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-a', file, signal: expect.any(AbortSignal) }),
    );

    const save = screen.getByRole('button', { name: 'Guardar ticket' });
    fireEvent.click(save);
    fireEvent.click(save);

    await screen.findByRole('button', { name: 'Ticket guardado' });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-a', file, signal: expect.any(AbortSignal) }),
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-a',
        ticketId: 'ticket-created-in-a',
        signal: expect.any(AbortSignal),
      }),
    );
    const patchPayload = mocks.update.mock.calls[0]?.[0].payload;
    expect(patchPayload).not.toHaveProperty('reviewStatus');
    expect(patchPayload).not.toHaveProperty('rawData');
    expect(patchPayload).not.toHaveProperty('products');
    expect(patchPayload).not.toHaveProperty('notes');
    expect(screen.getAllByText(/Café seguro/).length).toBeGreaterThan(0);
  });

  it('aborts preprocess, revokes preview and ignores a late A response after A to B', async () => {
    const pending = deferred<{ ticket: typeof preprocessTicket; ocrText: string }>();
    mocks.preprocess.mockReturnValueOnce(pending.promise);
    const view = render(<UploadPage />);

    uploadFile();
    await screen.findByText('Analizando imagen');
    const signal = mocks.preprocess.mock.calls[0]?.[0].signal as AbortSignal;

    mocks.companyId = 'company-b';
    view.rerender(<UploadPage />);

    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ticket-preview');
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'El análisis se canceló porque cambiaste de compañía.',
    );
    expect(screen.getByText('Sin ticket cargado')).toBeInTheDocument();

    await act(async () => {
      pending.resolve({ ticket: preprocessTicket, ocrText: 'Café seguro' });
      await pending.promise;
    });
    expect(screen.queryByText('Comercio A')).not.toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('clears a ready draft and cannot save it under B', async () => {
    const view = render(<UploadPage />);
    uploadFile();
    await waitForAnalyzed();

    mocks.companyId = 'company-b';
    view.rerender(<UploadPage />);

    await screen.findByText('Sin ticket cargado');
    expect(screen.queryByRole('button', { name: 'Guardar ticket' })).not.toBeInTheDocument();
    expect(screen.queryByText('Comercio A')).not.toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('keeps an in-flight upload on A and never repopulates B', async () => {
    const pending = deferred<{
      ticket: BackendTicket;
      imageUrl: string;
      ocrText: string;
    }>();
    mocks.upload.mockReturnValueOnce(pending.promise);
    const view = render(<UploadPage />);
    uploadFile();
    await waitForAnalyzed();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar ticket' }));
    const uploadInput = mocks.upload.mock.calls[0]?.[0];
    expect(uploadInput.companyId).toBe('company-a');

    mocks.companyId = 'company-b';
    view.rerender(<UploadPage />);
    await waitFor(() => expect(uploadInput.signal.aborted).toBe(true));

    await act(async () => {
      pending.resolve({
        ticket: persistedTicket,
        imageUrl: '/images/ticket-a.png',
        ocrText: 'Café seguro',
      });
      await pending.promise;
    });
    expect(screen.getByText('Sin ticket cargado')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('Ticket guardado correctamente.');
  });

  it('aborts a PATCH under A and never starts a PATCH under B', async () => {
    const pendingPatch = deferred<BackendTicket>();
    mocks.update.mockReturnValueOnce(pendingPatch.promise);
    const view = render(<UploadPage />);
    uploadFile();
    await waitForAnalyzed();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar ticket' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    const patchInput = mocks.update.mock.calls[0]?.[0];
    expect(patchInput.companyId).toBe('company-a');
    expect(patchInput.ticketId).toBe('ticket-created-in-a');

    mocks.companyId = 'company-b';
    view.rerender(<UploadPage />);
    await waitFor(() => expect(patchInput.signal.aborted).toBe(true));

    await act(async () => {
      pendingPatch.resolve(persistedTicket);
      await pendingPatch.promise;
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sin ticket cargado')).toBeInTheDocument();
  });

  it('does not PATCH when upload fails', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('upload failed'));
    render(<UploadPage />);
    uploadFile();
    await waitForAnalyzed();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar ticket' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not restore the cancelled draft when returning to A', async () => {
    const view = render(<UploadPage />);
    uploadFile();
    await waitForAnalyzed();

    mocks.companyId = 'company-b';
    view.rerender(<UploadPage />);
    await screen.findByText('Sin ticket cargado');

    mocks.companyId = 'company-a';
    view.rerender(<UploadPage />);

    expect(screen.getByText('Sin ticket cargado')).toBeInTheDocument();
    expect(screen.queryByText('Comercio A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar ticket' })).not.toBeInTheDocument();
  });

  it('aborts and revokes preview on unmount without an abort error toast', async () => {
    const pending = deferred<{ ticket: typeof preprocessTicket; ocrText: string }>();
    mocks.preprocess.mockReturnValueOnce(pending.promise);
    const view = render(<UploadPage />);
    uploadFile();
    await screen.findByText('Analizando imagen');
    const signal = mocks.preprocess.mock.calls[0]?.[0].signal as AbortSignal;

    view.unmount();

    expect(signal.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ticket-preview');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
