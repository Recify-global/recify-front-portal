import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryTicketTable } from '@/components/recify/HistoryTicketTable';
import {
  saveHistoryTicketDrafts,
  useHistoryTableEditing,
} from '@/hooks/use-history-table-editing';
import { mapBackendTicket } from '@/mappers/ticket.mapper';
import {
  buildHistoryTicketUpdatePayload,
  createHistoryDraftFromTicket,
  type HistoryTicketEditDraft,
} from '@/utils/ticket-edit';
import { formatTicketDateTime } from '@/utils/ticket-display';
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
  rawData: {
    subtotal: 428.45,
    tax: 68.55,
    products: [{ name: '<b>Café</b>', total: 100 }],
  },
  created_at: '2026-04-14T12:00:00.000Z',
  updated_at: '2026-04-14T12:00:00.000Z',
};

const uiTicket: UiTicket = mapBackendTicket(backendTicket);

function tableProps(overrides: Partial<React.ComponentProps<typeof HistoryTicketTable>> = {}) {
  return {
    tickets: [uiTicket],
    globalFilter: '',
    onGlobalFilterChange: vi.fn(),
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    isEditing: false,
    isSaving: false,
    drafts: {},
    dirtyTicketIds: [],
    validationErrors: {},
    rowErrors: {},
    deletingTicketId: null,
    onStartEditing: vi.fn(),
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

describe('History presentation', () => {
  it('uses a civil Chihuahua date and time in one value', () => {
    expect(formatTicketDateTime('2026-04-14', '06:00')).toBe('14/04/2026 · 06:00');
  });

  it('uses Sin comercio instead of category when vendor is absent', () => {
    expect(mapBackendTicket({ ...backendTicket, vendor: null, rawData: undefined }).comercio)
      .toBe('Sin comercio');
  });

  it('reads top-level tax when rawData is absent', () => {
    const mapped = mapBackendTicket({
      ...backendTicket,
      amount: 861,
      tax: 29.99,
      rawData: undefined,
    });
    expect(mapped.iva).toBe(29.99);
    expect(mapped.subtotal).toBeCloseTo(831.01);
  });

  it('prefers top-level tax over rawData tax', () => {
    const mapped = mapBackendTicket({ ...backendTicket, tax: 29.99 });
    expect(mapped.iva).toBe(29.99);
  });

  it('renders every required table column without review', () => {
    render(<HistoryTicketTable {...tableProps()} />);
    [
      'Comercio',
      'Fecha',
      'Total',
      'IVA',
      'Método de pago',
      'Tipo',
      'Estatus',
      'Categoría',
      'Acreditable',
      'Acciones',
    ].forEach((heading) => {
      expect(screen.getByRole('columnheader', { name: new RegExp(heading, 'i') }))
        .toBeInTheDocument();
    });
    [
      'Subtotal',
      'Moneda',
      'Productos o notas',
    ].forEach((heading) => {
      expect(screen.queryByRole('columnheader', { name: new RegExp(`^${heading}$`, 'i') }))
        .not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Revisi[oó]n|Revisado/i)).not.toBeInTheDocument();
    expect(screen.getByText('$497.00')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  });

  it('starts global editing with only the visible ticket IDs', () => {
    const onStartEditing = vi.fn();
    render(<HistoryTicketTable {...tableProps({ onStartEditing })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar tabla' }));
    expect(onStartEditing).toHaveBeenCalledWith(['ticket-a']);
  });

  it('does not make rows interactive after removing the drawer', () => {
    const onPreviewImage = vi.fn();
    const { container } = render(
      <HistoryTicketTable {...tableProps({ onPreviewImage })} />,
    );
    const row = container.querySelector('tbody tr');
    expect(row).not.toHaveClass('cursor-pointer');
    fireEvent.click(screen.getByText('Café Central'));
    expect(onPreviewImage).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Consultar ticket')).not.toBeInTheDocument();
  });

  it('opens only the image action and disables it without a safe image', () => {
    const onPreviewImage = vi.fn();
    const withImage = { ...uiTicket, imagenUrl: 'https://cdn.example.com/ticket.jpg' };
    const view = render(
      <HistoryTicketTable
        {...tableProps({ tickets: [withImage], onPreviewImage })}
      />,
    );
    fireEvent.click(screen.getByTitle('Ver imagen'));
    expect(onPreviewImage).toHaveBeenCalledWith(withImage);

    view.rerender(
      <HistoryTicketTable
        {...tableProps({ onPreviewImage })}
      />,
    );
    expect(screen.getByTitle('Sin imagen')).toBeDisabled();
  });
});

describe('History edit payload', () => {
  it('normalizes equivalent totals and sends no unchanged row', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const result = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      amount: '497.00',
    });
    expect(result).toEqual({ ok: false, reason: 'no-changes' });
  });

  it('builds date/time and dirty fields without reviewStatus', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const result = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      time: '07:30',
      vendor: '  Café Norte  ',
      amount: '500.25',
      category: '  Cafeterías  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({
      date: '2026-04-14T13:30:00.000Z',
      vendor: 'Café Norte',
      amount: 500.25,
      category: 'Cafeterías',
    });
    expect(result.payload).not.toHaveProperty('reviewStatus');
    expect(result.payload).not.toHaveProperty('products');
    expect(result.payload).not.toHaveProperty('notes');
  });
});

describe('useHistoryTableEditing', () => {
  it('keeps independent drafts, marks only changed rows, and cancels cleanly', () => {
    const secondTicket = {
      ...backendTicket,
      _id: 'ticket-b',
      amount: 100,
    };
    const { result } = renderHook(() => useHistoryTableEditing());

    act(() => {
      result.current.startEditing([
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        { id: secondTicket._id, companyId: 'company-a', ticket: secondTicket },
      ], 'company-a');
    });
    act(() => {
      result.current.updateDraftPatch('ticket-a', { amount: '600' });
    });

    expect(result.current.drafts['ticket-a'].amount).toBe('600');
    expect(result.current.drafts['ticket-b'].amount).toBe('100');
    expect(result.current.dirtyTicketIds).toEqual(['ticket-a']);

    act(() => result.current.cancelEditing());
    expect(result.current.isTableEditing).toBe(false);
    expect(result.current.drafts).toEqual({});
  });

  it('keeps failed rows editable after a partial save', () => {
    const { result } = renderHook(() => useHistoryTableEditing());
    act(() => {
      result.current.startEditing(
        [{ id: backendTicket._id, companyId: 'company-a', ticket: backendTicket }],
        'company-a',
      );
      result.current.updateDraft(
        backendTicket._id,
        'amount',
        '700' as HistoryTicketEditDraft['amount'],
      );
    });
    act(() => {
      result.current.applySaveResults([], {
        'ticket-a': 'No fue posible guardar este ticket.',
      });
    });
    expect(result.current.isTableEditing).toBe(true);
    expect(result.current.rowErrors['ticket-a']).toMatch(/No fue posible/);
  });

  it('does not create drafts for tickets from another company', () => {
    const { result } = renderHook(() => useHistoryTableEditing());
    act(() => {
      result.current.startEditing([
        { id: 'ticket-a', companyId: 'company-a', ticket: backendTicket },
        {
          id: 'ticket-b',
          companyId: 'company-b',
          ticket: { ...backendTicket, _id: 'ticket-b', companyId: 'company-b' },
        },
      ], 'company-a');
    });
    expect(Object.keys(result.current.drafts)).toEqual(['ticket-a']);
    expect(result.current.editingCompanyId).toBe('company-a');
  });

  it('saves only dirty rows with at most two concurrent requests', async () => {
    const tickets = ['a', 'b', 'c', 'unchanged'].map((suffix, index) => ({
      ...backendTicket,
      _id: `ticket-${suffix}`,
      amount: 100 + index,
    }));
    const baselines = Object.fromEntries(
      tickets.map((ticket) => [ticket._id, createHistoryDraftFromTicket(ticket)]),
    );
    const drafts = Object.fromEntries(
      tickets.map((ticket) => [
        ticket._id,
        ticket._id === 'ticket-unchanged'
          ? baselines[ticket._id]
          : { ...baselines[ticket._id], amount: '999' },
      ]),
    );
    let active = 0;
    let maxActive = 0;
    const save = vi.fn(async (ticketId: string, payload: object) => {
      expect(payload).not.toHaveProperty('reviewStatus');
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (ticketId === 'ticket-b') throw new Error('backend detail');
    });

    const result = await saveHistoryTicketDrafts({
      ticketIds: tickets.map((ticket) => ticket._id),
      baselines,
      drafts,
      save,
    });

    expect(save).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(2);
    expect(result.savedIds.sort()).toEqual(['ticket-a', 'ticket-c']);
    expect(result.errors['ticket-b']).toMatch(/No fue posible/);
    expect(result.errors['ticket-b']).not.toContain('backend detail');
  });
});
