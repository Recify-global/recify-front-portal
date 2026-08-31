import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceUploadResult } from '@/components/recify/InvoiceUploadResult';
import type { BackendInvoice, UploadInvoiceResponse } from '@/types/invoice';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  getInvoice: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    token: 'token',
    companyId: mocks.companyId,
  }),
}));

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({
    activeCompany: {
      _id: mocks.companyId ?? 'company-a',
      name: 'Acme',
      timezone: 'America/Mexico_City',
    },
  }),
}));

vi.mock('@/services/invoices.service', () => ({
  getInvoice: (...args: unknown[]) => mocks.getInvoice(...args),
}));

vi.mock('@/components/recify/InvoiceMatchPanel', () => ({
  InvoiceMatchPanel: () => <div>Match panel</div>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function invoice(overrides: Partial<BackendInvoice> = {}): BackendInvoice {
  return {
    _id: 'invoice-a',
    uuid: '11111111-1111-1111-1111-111111111111',
    type: 'egreso',
    issuerRfc: 'XAXX010101000',
    issuerName: 'Emisor Uno',
    receiverRfc: null,
    receiverName: null,
    date: '2026-07-13T06:00:00.000Z',
    subtotal: 100,
    tax: 16,
    total: 116,
    paymentForm: '03',
    paymentMethod: 'PUE',
    fileUrl: 'https://files.example/invoice.pdf',
    ticketId: null,
    matchStatus: 'unmatched',
    matchCandidates: [],
    created_at: '2026-07-13T06:00:00.000Z',
    updated_at: '2026-07-13T06:00:00.000Z',
    ...overrides,
  };
}

function uploadResponse(overrides: Partial<BackendInvoice> = {}): UploadInvoiceResponse {
  const current = invoice(overrides);
  return {
    fileUrl: current.fileUrl,
    ocrText: 'CFDI',
    invoice: current,
    match: { status: 'unmatched', ticket: null, candidates: [] },
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.companyId = 'company-a';
  mocks.getInvoice.mockResolvedValue(invoice({ fileUrl: 'https://files.example/fresh.pdf' }));
  vi.stubGlobal('open', mocks.open);
});

describe('InvoiceUploadResult PDF viewer', () => {
  it('shows Ver factura when a PDF URL exists and opens an internal viewer', async () => {
    render(<InvoiceUploadResult companyId="company-a" response={uploadResponse()} />);

    expect(screen.getByText('Emisor Uno')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));

    expect(await screen.findByRole('dialog', { name: 'Factura' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTitle('Vista del PDF de la factura')).toHaveAttribute(
        'src',
        'https://files.example/fresh.pdf',
      );
    });
    expect(mocks.getInvoice).toHaveBeenCalledWith('company-a', 'invoice-a');
    expect(mocks.open).not.toHaveBeenCalled();
    expect(screen.getByText('Emisor Uno')).toBeInTheDocument();
  });

  it('closes the viewer and keeps extracted invoice fields', async () => {
    render(<InvoiceUploadResult companyId="company-a" response={uploadResponse()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    await screen.findByRole('dialog', { name: 'Factura' });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar visor de factura' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Factura' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Emisor Uno')).toBeInTheDocument();
    expect(screen.getByText('$116.00')).toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does not show Ver factura or open a viewer without a PDF', () => {
    render(
      <InvoiceUploadResult
        companyId="company-a"
        response={uploadResponse({ fileUrl: '' })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ver factura' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.getInvoice).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('shows an error in the viewer when the PDF URL cannot be resolved', async () => {
    mocks.getInvoice.mockResolvedValue(invoice({ fileUrl: 'http://files.example/insecure.pdf' }));
    render(<InvoiceUploadResult companyId="company-a" response={uploadResponse()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la factura.');
    expect(screen.queryByTitle('Vista del PDF de la factura')).not.toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
