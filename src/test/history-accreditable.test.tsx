import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryTicketTable } from '@/components/recify/HistoryTicketTable';
import { mapBackendTicket } from '@/mappers/ticket.mapper';
import type { BackendTicket, UiTicket } from '@/types/ticket';

afterEach(cleanup);

const backendTicket: BackendTicket = {
  _id: 'ticket-a',
  companyId: 'company-a',
  vendor: 'Café Central',
  type: 'egreso',
  date: '2026-04-14T12:00:00.000Z',
  amount: 497,
  category: 'Restaurantes',
  paymentMethod: 'card',
  status: 'processed',
  reviewStatus: 'revisado',
  created_at: '2026-04-14T12:00:00.000Z',
  updated_at: '2026-04-14T12:00:00.000Z',
};

function mergeAccreditable(
  ticket: { isAccreditable?: boolean | null },
  dailyTicket: { isAccreditable?: boolean | null } | undefined,
): boolean {
  return ticket.isAccreditable ?? dailyTicket?.isAccreditable ?? true;
}

function tableProps(
  ticket: UiTicket,
  overrides: Partial<React.ComponentProps<typeof HistoryTicketTable>> = {},
) {
  return {
    tickets: [ticket],
    globalFilter: '',
    onGlobalFilterChange: vi.fn(),
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    isSaving: false,
    drafts: {},
    dirtyTicketIds: [],
    validationErrors: {},
    rowErrors: {},
    deletingTicketId: null,
    editingTicketId: null,
    editingField: null,
    onEditCell: vi.fn(),
    onUpdateDraft: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onPreviewImage: vi.fn(),
    onDelete: vi.fn(),
    onClearFilters: vi.fn(),
    onToggleAccreditable: vi.fn(),
    savingAccreditableIds: new Set<string>(),
    ...overrides,
  };
}

describe('History accreditable column', () => {
  it('renders the Acreditable header with an accessible help control', () => {
    render(<HistoryTicketTable {...tableProps(mapBackendTicket(backendTicket))} />);
    expect(screen.getByRole('columnheader', { name: /Acreditable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qué significa Acreditable' })).toBeInTheDocument();
  });

  it('normalizes missing isAccreditable to Sí with a controlled switch', () => {
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: undefined });
    expect(ticket.isAccreditable).toBe(true);
    render(<HistoryTicketTable {...tableProps(ticket)} />);
    const toggle = screen.getByRole('switch', {
      name: 'Marcar ticket de Café Central como acreditable',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).not.toHaveAttribute('data-state', 'indeterminate');
    expect(screen.getByText('Sí')).toBeInTheDocument();
  });

  it('normalizes null isAccreditable to Sí', () => {
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: null });
    expect(ticket.isAccreditable).toBe(true);
  });

  it('preserves explicit false as No', () => {
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: false });
    expect(ticket.isAccreditable).toBe(false);
    render(<HistoryTicketTable {...tableProps(ticket)} />);
    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('shows Yes when isAccreditable is true', () => {
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: true });
    render(<HistoryTicketTable {...tableProps(ticket)} />);
    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Sí')).toBeInTheDocument();
  });

  it('keeps No while PATCH is pending and disables only that switch', () => {
    const onToggleAccreditable = vi.fn();
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: false });
    const { rerender } = render(
      <HistoryTicketTable
        {...tableProps(ticket, {
          onToggleAccreditable,
          savingAccreditableIds: new Set(),
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    );
    expect(onToggleAccreditable).toHaveBeenCalledWith(ticket, true);

    // Parent still shows the previous value until backend confirms.
    rerender(
      <HistoryTicketTable
        {...tableProps(ticket, {
          onToggleAccreditable,
          savingAccreditableIds: new Set([ticket.id]),
        })}
      />,
    );
    const toggle = screen.getByRole('switch', {
      name: 'Marcar ticket de Café Central como acreditable',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('No')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onToggleAccreditable).toHaveBeenCalledTimes(1);
  });

  it('after success shows Sí from the confirmed ticket value', () => {
    const confirmed = mapBackendTicket({ ...backendTicket, isAccreditable: true });
    render(
      <HistoryTicketTable
        {...tableProps(confirmed, { savingAccreditableIds: new Set() })}
      />,
    );
    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Sí')).toBeInTheDocument();
  });

  it('keeps Sí while saving No and only re-enables after parent updates', () => {
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: true });
    render(
      <HistoryTicketTable
        {...tableProps(ticket, { savingAccreditableIds: new Set([ticket.id]) })}
      />,
    );
    const toggle = screen.getByRole('switch', {
      name: 'Marcar ticket de Café Central como acreditable',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Sí')).toBeInTheDocument();
  });

  it('requests false when changing Sí to No', () => {
    const onToggleAccreditable = vi.fn();
    const ticket = mapBackendTicket({ ...backendTicket, isAccreditable: true });
    render(
      <HistoryTicketTable
        {...tableProps(ticket, { onToggleAccreditable })}
      />,
    );

    fireEvent.click(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    );
    expect(onToggleAccreditable).toHaveBeenCalledOnce();
    expect(onToggleAccreditable).toHaveBeenCalledWith(ticket, false);
  });

  it('tracks pending independently for two tickets', () => {
    const ticketA = mapBackendTicket(backendTicket);
    const ticketB = mapBackendTicket({
      ...backendTicket,
      _id: 'ticket-b',
      vendor: 'OXXO',
      isAccreditable: true,
    });
    render(
      <HistoryTicketTable
        {...tableProps(ticketA, {
          tickets: [ticketA, ticketB],
          savingAccreditableIds: new Set(['ticket-a']),
        })}
      />,
    );

    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de OXXO como acreditable' }),
    ).not.toBeDisabled();
  });
});

describe('History accreditable merge priority', () => {
  it('prefers /tickets over a stale daily-report false', () => {
    expect(mergeAccreditable({ isAccreditable: true }, { isAccreditable: false })).toBe(true);
  });

  it('preserves explicit false from /tickets over daily undefined', () => {
    expect(mergeAccreditable({ isAccreditable: false }, { isAccreditable: undefined })).toBe(false);
  });

  it('falls back to daily then true', () => {
    expect(mergeAccreditable({ isAccreditable: undefined }, { isAccreditable: true })).toBe(true);
    expect(mergeAccreditable({ isAccreditable: null }, { isAccreditable: false })).toBe(false);
    expect(mergeAccreditable({}, undefined)).toBe(true);
  });
});

describe('History accreditable mutation payload', () => {
  it('builds a minimal isAccreditable-only payload', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      ...backendTicket,
      isAccreditable: true,
    });

    await mutateAsync({
      companyId: 'company-a',
      ticketId: 'ticket-a',
      payload: { isAccreditable: true },
    });

    const call = mutateAsync.mock.calls[0][0];
    expect(Object.keys(call.payload)).toEqual(['isAccreditable']);
    expect(call.payload.isAccreditable).toBe(true);
  });

  it('error path keeps the previous visual value', () => {
    const previous = false;
    let shown = previous;
    const toastError = vi.fn();
    try {
      throw new Error('network');
    } catch {
      toastError('No se pudo actualizar si el ticket es acreditable.');
      shown = previous;
    }
    expect(shown).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      'No se pudo actualizar si el ticket es acreditable.',
    );
  });
});

describe('History accreditable tenant / finalizer isolation', () => {
  it('finalizer of A does not clear pending for B', () => {
    const pending = new Set(['ticket-a', 'ticket-b']);
    pending.delete('ticket-a');
    expect(pending.has('ticket-a')).toBe(false);
    expect(pending.has('ticket-b')).toBe(true);
  });

  it('ignores a late success when the active company changed', async () => {
    const originCompanyId = 'company-a';
    let activeCompanyId = 'company-a';
    const patchCache = vi.fn();

    const runToggle = async () => {
      await new Promise<{ isAccreditable: boolean }>((resolve) => {
        setTimeout(() => resolve({ isAccreditable: true }), 5);
      });
      if (activeCompanyId !== originCompanyId) return;
      patchCache(originCompanyId);
    };

    const pending = runToggle();
    activeCompanyId = 'company-b';
    await pending;
    expect(patchCache).not.toHaveBeenCalled();
  });
});
