import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from '@/pages/UploadPage';

const mocks = vi.hoisted(() => ({
  preprocess: vi.fn(),
  invoiceUpload: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    token: 'test-token',
    companyId: 'company-a',
  }),
}));

vi.mock('@/hooks/use-upload-ticket', () => ({
  usePreprocessTicket: () => ({
    mutateAsync: mocks.preprocess,
    isPending: false,
    reset: vi.fn(),
  }),
  useUploadTicket: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-tickets', () => ({
  useUpdateDashboardTicket: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-invoices', () => ({
  useUploadInvoice: () => ({
    mutateAsync: mocks.invoiceUpload,
    isPending: false,
    reset: vi.fn(),
  }),
  useConfirmInvoiceMatch: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
  useUnlinkInvoiceMatch: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
  useUpdateInvoiceMatchStatus: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
  useRecalculateMatchCandidates: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
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

function uploadFile(name: string, type: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['content'], name, { type });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preprocess.mockResolvedValue({
    ticket: {
      vendor: 'Comercio A',
      type: 'egreso',
      date: '2026-07-13T18:00:00.000Z',
      amount: 100,
      category: 'Restaurantes',
      paymentMethod: 'card',
      status: 'processed',
    },
    ocrText: 'OCR',
  });
  mocks.invoiceUpload.mockResolvedValue({
    fileUrl: 'https://files.example/invoice.pdf',
    ocrText: 'CFDI',
    invoice: { _id: 'invoice-a', matchCandidates: [] },
    match: { status: 'unmatched', ticket: null, candidates: [] },
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe('UploadPage format hint', () => {
  it('shows the simplified supported formats and size limit', () => {
    render(<UploadPage />);
    expect(screen.getByText('PNG, JPG o PDF · Máx. 10 MB')).toBeInTheDocument();
    expect(screen.queryByText(/WEBP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GIF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PDF de una página/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ticket: PNG/i)).not.toBeInTheDocument();
  });
});

describe('UploadPage format acceptance', () => {
  it('accepts PNG and JPG uploads for ticket analysis', async () => {
    render(<UploadPage />);

    uploadFile('ticket.png', 'image/png');
    await waitFor(() => expect(mocks.preprocess).toHaveBeenCalledOnce());

    mocks.preprocess.mockClear();
    uploadFile('ticket.jpg', 'image/jpeg');
    await waitFor(() => expect(mocks.preprocess).toHaveBeenCalledOnce());
  });

  it('accepts PDF uploads for invoice analysis', async () => {
    render(<UploadPage />);
    uploadFile('invoice.pdf', 'application/pdf');
    await waitFor(() => expect(mocks.invoiceUpload).toHaveBeenCalledOnce());
    expect(mocks.preprocess).not.toHaveBeenCalled();
  });

  it('rejects unsupported formats with an aligned error message', async () => {
    render(<UploadPage />);
    uploadFile('notes.txt', 'text/plain');
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Formato no permitido. Usa PNG, JPG o PDF.'),
    );
    expect(mocks.preprocess).not.toHaveBeenCalled();
    expect(mocks.invoiceUpload).not.toHaveBeenCalled();
  });
});
