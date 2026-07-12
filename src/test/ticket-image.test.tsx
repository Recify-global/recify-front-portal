import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TicketImagePreview } from '@/components/recify/TicketImagePreview';
import {
  resolveTicketImageUrl,
  selectTicketImageUrl,
} from '@/utils/ticket-image';

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

  it('rejects dangerous schemes and token query params', () => {
    expect(resolveTicketImageUrl('javascript:alert(1)')).toBeNull();
    expect(
      resolveTicketImageUrl('https://cdn.example.com/a.jpg?token=secret'),
    ).toBeNull();
  });

  it('returns null for empty or undefined values', () => {
    expect(resolveTicketImageUrl(undefined)).toBeNull();
    expect(resolveTicketImageUrl('')).toBeNull();
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
});
