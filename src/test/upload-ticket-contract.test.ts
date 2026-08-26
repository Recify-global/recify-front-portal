import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadTicket } from '@/services/upload.service';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/api/http', () => ({
  apiRequest: mocks.apiRequest,
}));

describe('upload ticket creation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiRequest.mockResolvedValue({
      imageUrl: 'https://example.com/ticket.jpg',
      ocrText: 'ocr',
      ticket: {
        _id: 'ticket-1',
        companyId: 'company-a',
        type: 'egreso',
        date: '2026-07-26T12:00:00.000Z',
        amount: 100,
        paymentMethod: 'card',
        status: 'processed',
        isAccreditable: false,
        created_at: '2026-07-26T12:00:00.000Z',
        updated_at: '2026-07-26T12:00:00.000Z',
      },
    });
  });

  it('sends only the image FormData field and no isAccreditable on create', async () => {
    const file = new File(['img'], 'ticket.png', { type: 'image/png' });

    await uploadTicket('company-a', file);

    expect(mocks.apiRequest).toHaveBeenCalledOnce();
    const [path, opts] = mocks.apiRequest.mock.calls[0];
    expect(path).toBe('/companies/company-a/upload/ticket');
    expect(opts.method).toBe('POST');
    expect(opts.formData).toBeInstanceOf(FormData);
    expect(opts.body).toBeUndefined();

    const formData = opts.formData as FormData;
    expect(Array.from(formData.keys())).toEqual(['image']);
    expect(formData.get('image')).toBe(file);
    expect(formData.has('isAccreditable')).toBe(false);
    expect(formData.has('accreditable')).toBe(false);
  });

  it('does not invent a follow-up PATCH from the upload service', async () => {
    const file = new File(['img'], 'ticket.png', { type: 'image/png' });
    await uploadTicket('company-a', file);
    expect(mocks.apiRequest).toHaveBeenCalledTimes(1);
  });
});
