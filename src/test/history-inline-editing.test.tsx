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
    expect(screen.queryByRole('button', { name: 'Editar tabla' })).not.toBeInTheDocument();
    expect(screen.getByText('$497.00')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();
  });

  it('activates only the clicked editable cell', () => {
    const onEditCell = vi.fn();
    render(<HistoryTicketTable {...tableProps({ onEditCell })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar comercio de Café Central' }));
    expect(onEditCell).toHaveBeenCalledWith(uiTicket, 'vendor');
    expect(onEditCell).toHaveBeenCalledTimes(1);
  });

  it('does not activate editing from image or accreditable', () => {
    const onEditCell = vi.fn();
    const onPreviewImage = vi.fn();
    const onToggleAccreditable = vi.fn();
    const withImage = { ...uiTicket, imagenUrl: 'https://cdn.example.com/ticket.jpg' };
    render(
      <HistoryTicketTable
        {...tableProps({
          tickets: [withImage],
          onEditCell,
          onPreviewImage,
          onToggleAccreditable,
        })}
      />,
    );
    fireEvent.click(screen.getByTitle('Ver imagen'));
    expect(onPreviewImage).toHaveBeenCalledWith(withImage);
    expect(onEditCell).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' }),
    );
    expect(onToggleAccreditable).toHaveBeenCalled();
    expect(onEditCell).not.toHaveBeenCalled();
  });

  it('activates IVA as an editable tax cell', () => {
    const onEditCell = vi.fn();
    render(<HistoryTicketTable {...tableProps({ onEditCell })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar IVA de Café Central' }));
    expect(onEditCell).toHaveBeenCalledWith(uiTicket, 'tax');
    expect(screen.queryByRole('button', { name: /Guardar cambios/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar edición/i })).not.toBeInTheDocument();
  });

  it('shows a hover/focus edit hint only on the eight editable cells', () => {
    const onEditCell = vi.fn();
    const withImage = { ...uiTicket, imagenUrl: 'https://cdn.example.com/ticket.jpg' };
    const { container } = render(
      <HistoryTicketTable {...tableProps({ tickets: [withImage], onEditCell })} />,
    );

    const editableCells = container.querySelectorAll('[data-history-editable-cell]');
    const hints = container.querySelectorAll('[data-history-edit-hint]');
    expect(editableCells).toHaveLength(8);
    expect(hints).toHaveLength(8);

    const editableLabels = [
      'Editar comercio de Café Central',
      'Editar fecha de Café Central',
      'Editar total de Café Central',
      'Editar IVA de Café Central',
      'Editar método de pago de Café Central',
      'Editar tipo de Café Central',
      'Editar estatus de Café Central',
      'Editar categoría de Café Central',
    ];
    for (const label of editableLabels) {
      const cell = screen.getByRole('button', { name: label });
      expect(cell.querySelector('[data-history-edit-hint]')).not.toBeNull();
    }

    expect(screen.getByText('Café Central')).toBeInTheDocument();
    expect(screen.getByText('$497.00')).toBeInTheDocument();
    expect(screen.getByText('$68.55')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta')).toBeInTheDocument();

    expect(screen.getByTitle('Ver imagen').querySelector('[data-history-edit-hint]')).toBeNull();
    expect(
      screen.getByRole('switch', { name: 'Marcar ticket de Café Central como acreditable' })
        .closest('div')
        ?.querySelector('[data-history-edit-hint]'),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Editar comercio de Café Central' }));
    expect(onEditCell).toHaveBeenCalledWith(withImage, 'vendor');
  });

  it('reveals only the hovered or focused editable cell hint', () => {
    render(<HistoryTicketTable {...tableProps()} />);
    const comercio = screen.getByRole('button', { name: 'Editar comercio de Café Central' });
    const categoria = screen.getByRole('button', { name: 'Editar categoría de Café Central' });
    const comercioHint = comercio.querySelector('[data-history-edit-hint]');
    const categoriaHint = categoria.querySelector('[data-history-edit-hint]');

    fireEvent.mouseMove(comercio, { clientX: 24, clientY: 10 });
    expect(comercioHint).toHaveAttribute('data-visible', 'true');
    expect(comercioHint).toHaveAttribute('data-mode', 'pointer');
    expect(categoriaHint).not.toHaveAttribute('data-visible', 'true');

    fireEvent.mouseLeave(comercio);
    fireEvent.mouseMove(categoria, { clientX: 40, clientY: 12 });
    expect(comercioHint).not.toHaveAttribute('data-visible', 'true');
    expect(categoriaHint).toHaveAttribute('data-visible', 'true');
    expect(categoriaHint).toHaveAttribute('data-mode', 'pointer');

    fireEvent.mouseLeave(categoria);
    expect(categoriaHint).not.toHaveAttribute('data-visible', 'true');

    fireEvent.focus(comercio);
    expect(comercioHint).toHaveAttribute('data-visible', 'true');
    expect(comercioHint).toHaveAttribute('data-mode', 'focus');
    expect(categoriaHint).not.toHaveAttribute('data-visible', 'true');
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

  it('does not show save check or cancel X while a cell is active', () => {
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'vendor',
          drafts: { 'ticket-a': draft },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Guardar cambios de Café Central' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar edición de Café Central' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Sin imagen')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Editar comercio de Café Central' })).toBeInTheDocument();
  });

  it('keeps Total editor open across keystrokes without saving', () => {
    const onSave = vi.fn();
    const onUpdateDraft = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    const view = render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'amount',
          drafts: { 'ticket-a': draft },
          dirtyTicketIds: [],
          onSave,
          onUpdateDraft,
        })}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Editar total de Café Central' });
    fireEvent.change(input, { target: { value: '1' } });
    expect(onUpdateDraft).toHaveBeenCalledWith('ticket-a', { amount: '1' });
    expect(onSave).not.toHaveBeenCalled();

    view.rerender(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'amount',
          drafts: { 'ticket-a': { ...draft, amount: '1' } },
          dirtyTicketIds: ['ticket-a'],
          onSave,
          onUpdateDraft,
        })}
      />,
    );

    const stillOpen = screen.getByRole('textbox', { name: 'Editar total de Café Central' });
    fireEvent.change(stillOpen, { target: { value: '12' } });
    fireEvent.change(stillOpen, { target: { value: '12.' } });
    fireEvent.change(stillOpen, { target: { value: '12.5' } });
    expect(onUpdateDraft).toHaveBeenCalledWith('ticket-a', { amount: '12' });
    expect(onUpdateDraft).toHaveBeenCalledWith('ticket-a', { amount: '12.' });
    expect(onUpdateDraft).toHaveBeenCalledWith('ticket-a', { amount: '12.5' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Editar total de Café Central' })).toBeInTheDocument();
  });

  it('keeps IVA editor open across keystrokes without saving', () => {
    const onSave = vi.fn();
    const onUpdateDraft = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    const view = render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'tax',
          drafts: { 'ticket-a': draft },
          onSave,
          onUpdateDraft,
        })}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Editar IVA de Café Central' });
    for (const value of ['1', '12', '123', '1234', '1234.', '1234.5', '1234.56']) {
      fireEvent.change(input, { target: { value } });
      expect(onUpdateDraft).toHaveBeenCalledWith('ticket-a', { tax: value });
      view.rerender(
        <HistoryTicketTable
          {...tableProps({
            editingTicketId: 'ticket-a',
            editingField: 'tax',
            drafts: { 'ticket-a': { ...draft, tax: value } },
            dirtyTicketIds: ['ticket-a'],
            onSave,
            onUpdateDraft,
          })}
        />,
      );
    }

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Editar IVA de Café Central' })).toBeInTheDocument();
  });

  it('commits IVA once on Enter and ignores the following blur', () => {
    const onSave = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'tax',
          drafts: { 'ticket-a': { ...draft, tax: '90' } },
          onSave,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Editar IVA de Café Central' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not commit Total on a blur that immediately returns focus to the editor', async () => {
    const onSave = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'amount',
          drafts: { 'ticket-a': { ...draft, amount: '12.5' } },
          onSave,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Editar total de Café Central' });
    fireEvent.blur(input);
    input.focus();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('commits once on Enter and ignores the following blur', () => {
    const onSave = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'vendor',
          drafts: { 'ticket-a': draft },
          onSave,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Editar comercio de Café Central' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('commits on outside pointerdown and cancels on Escape without saving', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'amount',
          drafts: { 'ticket-a': draft },
          onSave,
          onCancel,
        })}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Editar total de Café Central' });
    expect(input.className).toMatch(/min-w-\[7\.5rem\]/);
    fireEvent.pointerDown(document.body);
    expect(onSave).toHaveBeenCalledTimes(1);

    onSave.mockClear();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not treat another editable cell as an outside commit', () => {
    const onSave = vi.fn();
    const onEditCell = vi.fn();
    const draft = createHistoryDraftFromTicket(backendTicket);
    render(
      <HistoryTicketTable
        {...tableProps({
          editingTicketId: 'ticket-a',
          editingField: 'vendor',
          drafts: { 'ticket-a': draft },
          onSave,
          onEditCell,
        })}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Editar total de Café Central' }));
    expect(onSave).not.toHaveBeenCalled();
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

  it('builds date/time and dirty fields without reviewStatus or tax', () => {
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
    expect(result.payload).not.toHaveProperty('tax');
    expect(result.payload).not.toHaveProperty('iva');
    expect(result.payload).not.toHaveProperty('products');
    expect(result.payload).not.toHaveProperty('notes');
  });

  it('builds a tax-only payload without amount', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    expect(baseline.tax).toBe('68.55');
    const result = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      tax: '172.41',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({ tax: 172.41 });
    expect(result.payload).not.toHaveProperty('amount');
    expect(result.payload).not.toHaveProperty('iva');
  });

  it('rejects invalid tax without sending amount', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const result = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      tax: '12.5.5',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'validation',
      message: 'Ingresa un IVA válido mayor o igual a 0.',
    });
  });

  it('clears tax with null when the draft is emptied', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const result = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      tax: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({ tax: null });
    expect(result.payload).not.toHaveProperty('amount');
  });
});

describe('useHistoryTableEditing', () => {
  it('opens a single cell draft and keeps other fields unread', () => {
    const { result } = renderHook(() => useHistoryTableEditing());

    act(() => {
      const status = result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'vendor',
        'company-a',
      );
      expect(status).toBe('activated');
    });

    expect(result.current.editingCell).toEqual({ ticketId: 'ticket-a', field: 'vendor' });
    expect(Object.keys(result.current.drafts)).toEqual(['ticket-a']);
    expect(result.current.isCellEditing('ticket-a', 'vendor')).toBe(true);
    expect(result.current.isCellEditing('ticket-a', 'amount')).toBe(false);
  });

  it('signals needs-commit when switching dirty cells without discarding', () => {
    const { result } = renderHook(() => useHistoryTableEditing());

    act(() => {
      result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'vendor',
        'company-a',
      );
    });
    act(() => {
      result.current.updateDraftPatch('ticket-a', { vendor: 'Nuevo' });
    });

    let status: string | undefined;
    act(() => {
      status = result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'amount',
        'company-a',
      );
    });

    expect(status).toBe('needs-commit');
    expect(result.current.editingCell?.field).toBe('vendor');
    expect(result.current.drafts['ticket-a'].vendor).toBe('Nuevo');
  });

  it('switches cleanly when the active cell has no dirty changes', () => {
    const { result } = renderHook(() => useHistoryTableEditing());

    act(() => {
      result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'vendor',
        'company-a',
      );
    });

    let status: string | undefined;
    act(() => {
      status = result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'amount',
        'company-a',
      );
    });

    expect(status).toBe('activated');
    expect(result.current.editingCell).toEqual({ ticketId: 'ticket-a', field: 'amount' });
  });

  it('cancels cleanly and ignores foreign company tickets', () => {
    const { result } = renderHook(() => useHistoryTableEditing());
    act(() => {
      expect(
        result.current.requestCellEdit(
          {
            id: 'ticket-b',
            companyId: 'company-b',
            ticket: { ...backendTicket, _id: 'ticket-b', companyId: 'company-b' },
          },
          'vendor',
          'company-a',
        ),
      ).toBe('ignored');
    });
    expect(result.current.editingCell).toBeNull();

    act(() => {
      result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'amount',
        'company-a',
      );
    });
    act(() => result.current.cancelEditing());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.drafts).toEqual({});
  });

  it('keeps failed rows editable after a partial save', () => {
    const { result } = renderHook(() => useHistoryTableEditing());
    act(() => {
      result.current.requestCellEdit(
        { id: backendTicket._id, companyId: 'company-a', ticket: backendTicket },
        'amount',
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
    expect(result.current.isEditing).toBe(true);
    expect(result.current.rowErrors['ticket-a']).toMatch(/No fue posible/);
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
      expect(payload).not.toHaveProperty('tax');
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
    expect(result.savedIds).toEqual(['ticket-a', 'ticket-c']);
    expect(result.errors['ticket-b']).toMatch(/No fue posible/);
  });
});
