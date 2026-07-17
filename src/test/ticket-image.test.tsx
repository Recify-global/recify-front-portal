import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import { TicketImageDialog } from '@/components/recify/TicketImageDialog';
import {
  resolveTicketImageUrl,
  selectTicketImageUrl,
  mergeTicketImageUrl,
} from '@/utils/ticket-image';
import { getTicketImageUrl } from '@/utils/ticket-display';
import type { BackendTicket } from '@/types/ticket';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('resolveTicketImageUrl', () => {
  it('accepts HTTPS and blob URLs', () => {
    expect(resolveTicketImageUrl('https://cdn.example.com/ticket.jpg')).toBe(
      'https://cdn.example.com/ticket.jpg',
    );
    expect(resolveTicketImageUrl('blob:http://localhost/id')).toBe(
      'blob:http://localhost/id',
    );
  });

  it('resolves a relative path against the configured backend origin', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
    expect(resolveTicketImageUrl('/uploads/tickets/a.jpg')).toBe(
      'http://localhost:3000/uploads/tickets/a.jpg',
    );
  });

  it('rejects dangerous schemes and session token query params', () => {
    expect(resolveTicketImageUrl('javascript:alert(1)')).toBeNull();
    expect(resolveTicketImageUrl('data:image/png;base64,abc')).toBeNull();
    expect(resolveTicketImageUrl('file:///tmp/ticket.jpg')).toBeNull();
    expect(resolveTicketImageUrl('ftp://files.example/ticket.jpg')).toBeNull();
    expect(resolveTicketImageUrl('//evil.example/ticket.jpg')).toBeNull();
    expect(
      resolveTicketImageUrl('https://cdn.example.com/a.jpg?token=secret'),
    ).toBeNull();
    expect(
      resolveTicketImageUrl('https://user:pass@cdn.example.com/a.jpg'),
    ).toBeNull();
  });

  it('accepts signed HTTPS URLs and preserves the full query string', () => {
    const signed =
      'https://storage.example.com/tickets/a.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20250715%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250715T000000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=deadbeef';
    expect(resolveTicketImageUrl(signed)).toBe(signed);
  });

  it('returns null for empty or undefined values', () => {
    expect(resolveTicketImageUrl(undefined)).toBeNull();
    expect(resolveTicketImageUrl('')).toBeNull();
  });
});

describe('mergeTicketImageUrl', () => {
  it('prefers the tickets list URL over daily-report cache', () => {
    expect(
      mergeTicketImageUrl(
        { imageUrl: 'https://cdn.example.com/fresh.jpg' },
        { imageUrl: 'https://cdn.example.com/stale.jpg' },
      ),
    ).toBe('https://cdn.example.com/fresh.jpg');
  });

  it('falls back to daily-report when the list has no image', () => {
    expect(
      mergeTicketImageUrl(
        { imageUrl: null },
        { imageUrl: 'https://cdn.example.com/daily.jpg' },
      ),
    ).toBe('https://cdn.example.com/daily.jpg');
  });
});

describe('getTicketImageUrl', () => {
  it('prefers top-level signed imageUrl over stale rawData', () => {
    const ticket = {
      _id: 'ticket-a',
      companyId: 'company-a',
      type: 'egreso',
      date: '2026-04-14T12:00:00.000Z',
      amount: 100,
      paymentMethod: 'card',
      status: 'processed',
      reviewStatus: 'revisado',
      imageUrl: 'https://cdn.example.com/signed.jpg',
      rawData: { imageUrl: 'https://cdn.example.com/stale.jpg' },
      created_at: '2026-04-14T12:00:00.000Z',
      updated_at: '2026-04-14T12:00:00.000Z',
    } satisfies BackendTicket;
    expect(getTicketImageUrl(ticket)).toBe('https://cdn.example.com/signed.jpg');
  });
});

describe('selectTicketImageUrl', () => {
  const listItem = {
    ticketId: 'ticket-1',
    companyId: 'company-a',
    imageUrl: 'https://cdn.example.com/list.jpg',
  };

  it('prioritizes detail over list for the same ticket and company', () => {
    const detail = {
      ...listItem,
      imageUrl: 'https://cdn.example.com/detail.jpg',
    };
    expect(
      selectTicketImageUrl('company-a', 'ticket-1', detail, listItem),
    ).toBe('https://cdn.example.com/detail.jpg');
  });

  it('uses list fallback only in the same context', () => {
    expect(
      selectTicketImageUrl('company-a', 'ticket-1', null, listItem),
    ).toBe('https://cdn.example.com/list.jpg');
    expect(
      selectTicketImageUrl('company-b', 'ticket-1', null, listItem),
    ).toBeNull();
    expect(
      selectTicketImageUrl('company-a', 'ticket-2', null, listItem),
    ).toBeNull();
  });
});

describe('TicketImagePreview', () => {
  it('falls back to the local preview when the persistent image fails', () => {
    render(
      <TicketImagePreview
        imageUrl="https://cdn.example.com/persisted.jpg"
        fallbackImageUrl="blob:http://localhost/local-preview"
        alt="Ticket"
      />,
    );

    const image = screen.getByAltText('Ticket');
    expect(image).toHaveAttribute(
      'src',
      'https://cdn.example.com/persisted.jpg',
    );
    fireEvent.error(image);
    expect(screen.getByAltText('Ticket')).toHaveAttribute(
      'src',
      'blob:http://localhost/local-preview',
    );
  });

  it('shows an explicit placeholder when no image exists', () => {
    render(<TicketImagePreview imageUrl={undefined} alt="Ticket" />);
    expect(screen.getByText('Sin imagen')).toBeInTheDocument();
  });

  it('does not report a missing image while remote sources are loading', () => {
    render(
      <TicketImagePreview imageUrl={undefined} loading alt="Ticket" />,
    );
    expect(
      screen.getByLabelText('Cargando imagen del ticket'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sin imagen')).not.toBeInTheDocument();
  });

  it('resets image error when the ticket URL changes', () => {
    const view = render(
      <TicketImagePreview
        imageUrl="https://cdn.example.com/broken.jpg"
        alt="Ticket A"
      />,
    );
    fireEvent.error(screen.getByAltText('Ticket A'));
    expect(screen.getByText('No fue posible cargar la imagen.')).toBeInTheDocument();

    view.rerender(
      <TicketImagePreview
        imageUrl="https://cdn.example.com/next.jpg"
        alt="Ticket B"
      />,
    );
    expect(screen.getByAltText('Ticket B')).toHaveAttribute(
      'src',
      'https://cdn.example.com/next.jpg',
    );
  });

  it('ignores a late error from the previous image', () => {
    const view = render(
      <TicketImagePreview imageUrl="https://cdn.example.com/a.jpg" alt="Ticket A" />,
    );
    const staleImage = screen.getByAltText('Ticket A');
    view.rerender(
      <TicketImagePreview imageUrl="https://cdn.example.com/b.jpg" alt="Ticket B" />,
    );
    fireEvent.error(staleImage);
    expect(screen.getByAltText('Ticket B')).toHaveAttribute(
      'src',
      'https://cdn.example.com/b.jpg',
    );
    expect(screen.queryByText('No fue posible cargar la imagen.')).not.toBeInTheDocument();
  });

  it('opens internally with the active fallback and never renders an external link', () => {
    const onView = vi.fn();
    render(
      <TicketImagePreview
        imageUrl="https://cdn.example.com/broken.jpg"
        fallbackImageUrl="blob:http://localhost/local-preview"
        alt="Ticket"
        onView={onView}
      />,
    );
    fireEvent.error(screen.getByAltText('Ticket'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen completa' }));
    expect(onView).toHaveBeenCalledWith('blob:http://localhost/local-preview');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('TicketImageDialog', () => {
  it('shows a safe image with accessible close controls', () => {
    const onOpenChange = vi.fn();
    render(
      <TicketImageDialog
        open
        onOpenChange={onOpenChange}
        imageUrl="https://cdn.example.com/ticket.jpg"
        alt="Ticket de Café Central"
        title="Ticket de Café Central"
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Ticket de Café Central' })).toBeInTheDocument();
    expect(screen.getByAltText('Ticket de Café Central')).toHaveAttribute(
      'src',
      'https://cdn.example.com/ticket.jpg',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not open for an unsafe URL', () => {
    render(
      <TicketImageDialog
        open
        onOpenChange={vi.fn()}
        imageUrl="javascript:alert(1)"
        alt="Ticket"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a retry action after a load failure', () => {
    const onRetry = vi.fn();
    render(
      <TicketImageDialog
        open
        onOpenChange={vi.fn()}
        imageUrl="https://cdn.example.com/broken.jpg"
        alt="Ticket"
        onRetry={onRetry}
      />,
    );
    fireEvent.error(screen.getByAltText('Ticket'));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
