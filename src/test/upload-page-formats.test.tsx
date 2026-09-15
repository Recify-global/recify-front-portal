import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from '@/pages/UploadPage';
import { ApiRequestError } from '@/api/http';

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

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({
    activeCompany: { _id: 'company-a', name: 'Acme', timezone: 'America/Mexico_City' },
    companies: [],
    allowedIds: ['company-a'],
    hasNames: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
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

function uploadFile(name: string, type: string, content = 'content') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type });
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
  it('shows every supported format and the size limit', () => {
    render(<UploadPage />);
    expect(
      screen.getByText('Imágenes JPG, PNG, WEBP, GIF o PDF CFDI · Máx. 10 MB'),
    ).toBeInTheDocument();
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
    uploadFile('invoice.pdf', 'application/pdf', '%PDF-1.7');
    await waitFor(() => expect(mocks.invoiceUpload).toHaveBeenCalledOnce());
    expect(mocks.preprocess).not.toHaveBeenCalled();
  });

  it('accepts a real PDF whose browser MIME is empty', async () => {
    render(<UploadPage />);
    uploadFile('invoice.pdf', '', '%PDF-1.7');
    await waitFor(() => expect(mocks.invoiceUpload).toHaveBeenCalledOnce());
    expect(mocks.preprocess).not.toHaveBeenCalled();
  });

  it('rejects renamed non-PDF content before upload', async () => {
    render(<UploadPage />);
    uploadFile('malware.pdf', 'application/pdf', 'MZ executable');
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'El contenido del archivo no corresponde a un PDF válido.',
      ),
    );
    expect(mocks.invoiceUpload).not.toHaveBeenCalled();
    expect(mocks.preprocess).not.toHaveBeenCalled();
  });

  it('rejects unsupported formats with an aligned error message', async () => {
    render(<UploadPage />);
    uploadFile('notes.txt', 'text/plain');
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
      ),
    );
    expect(mocks.preprocess).not.toHaveBeenCalled();
    expect(mocks.invoiceUpload).not.toHaveBeenCalled();
  });

  it('shows a backend PDF error and restores the idle state', async () => {
    mocks.invoiceUpload.mockRejectedValueOnce(new ApiRequestError('Invalid PDF', 400));
    render(<UploadPage />);

    uploadFile('invoice.pdf', 'application/pdf', '%PDF-1.7');

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('El archivo no es un PDF válido.'),
    );
    expect(screen.getByText('Sin archivo cargado')).toBeInTheDocument();
  });

  it('does not show upload success when fake.jpg is rejected by the backend', async () => {
    mocks.preprocess.mockRejectedValueOnce(
      new ApiRequestError('File content is not a supported image (jpeg, png, webp, gif)', 400),
    );
    render(<UploadPage />);

    uploadFile('fake.jpg', 'image/jpeg', 'not-a-jpeg');

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'File content is not a supported image (jpeg, png, webp, gif)',
      ),
    );
    expect(screen.queryByText('Archivo cargado correctamente')).not.toBeInTheDocument();
    expect(screen.getByText('Sin archivo cargado')).toBeInTheDocument();
    expect(screen.getByText('Arrastra tu ticket o factura aquí')).toBeInTheDocument();
    expect(screen.queryByText('Analizando…')).not.toBeInTheDocument();

    mocks.preprocess.mockClear();
    uploadFile('ticket.png', 'image/png');
    await waitFor(() => expect(mocks.preprocess).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByText('Ticket analizado correctamente')).toBeInTheDocument(),
    );
  });
});
