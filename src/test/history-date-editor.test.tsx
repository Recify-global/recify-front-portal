import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryTicketTable } from '@/components/recify/HistoryTicketTable';
import type { HistoryTicketEditDraft } from '@/utils/ticket-edit';
import type { BackendTicket, UiTicket } from '@/types/ticket';
import { buildHistoryTicketUpdatePayload, createHistoryDraftFromTicket } from '@/utils/ticket-edit';
import { formatCivilDateDisplay } from '@/utils/civil-date-input';

const ticket: UiTicket = {
  id: 't1',
  comercio: 'Cafe',
  fecha: '2026-07-27',
  hora: '00:00',
  subtotal: 100,
  iva: 16,
  total: 116,
  moneda: 'MXN',
  categoria: 'Restaurantes',
  tipo: 'Gasto',
  metodoPago: 'Tarjeta',
  estatus: 'analizado',
  reviewStatus: 'Pendiente de revisión',
  isAccreditable: true,
};

const backendTicket: BackendTicket = {
  _id: 't1',
  companyId: 'company-a',
  vendor: 'Cafe',
  type: 'egreso',
  date: '2026-07-27T06:00:00.000Z',
  amount: 116,
  tax: 16,
  category: 'Restaurantes',
  paymentMethod: 'card',
  status: 'processed',
  reviewStatus: 'pendiente',
  created_at: '2026-07-27T06:00:00.000Z',
  updated_at: '2026-07-27T06:00:00.000Z',
};

describe('history date cell typing', () => {
  afterEach(cleanup);

  it('keeps the editor open while typing DD/MM/AAAA with zero commits', () => {
    const onSave = vi.fn();
    const onUpdateDraft = vi.fn();
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const draft: HistoryTicketEditDraft = {
      ...baseline,
      date: formatCivilDateDisplay(baseline.date),
    };

    const { rerender } = render(
      <HistoryTicketTable
        tickets={[ticket]}
        globalFilter=""
        onGlobalFilterChange={vi.fn()}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        isSaving={false}
        drafts={{ t1: draft }}
        dirtyTicketIds={['t1']}
        validationErrors={{}}
        rowErrors={{}}
        deletingTicketId={null}
        editingTicketId="t1"
        editingField="date"
        onEditCell={vi.fn()}
        onUpdateDraft={onUpdateDraft}
        onSave={onSave}
        onCancel={vi.fn()}
        onPreviewImage={vi.fn()}
        onDelete={vi.fn()}
        onClearFilters={vi.fn()}
        onToggleAccreditable={vi.fn()}
        savingAccreditableIds={new Set()}
      />,
    );

    const input = screen.getByLabelText('Editar fecha de Cafe');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('placeholder', 'DD/MM/AAAA');

    let current = '';
    for (const ch of '26/07/2026') {
      current += ch;
      fireEvent.change(input, { target: { value: current } });
      const nextDraft = { ...draft, date: current };
      rerender(
        <HistoryTicketTable
          tickets={[ticket]}
          globalFilter=""
          onGlobalFilterChange={vi.fn()}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
          isSaving={false}
          drafts={{ t1: nextDraft }}
          dirtyTicketIds={['t1']}
          validationErrors={{}}
          rowErrors={{}}
          deletingTicketId={null}
          editingTicketId="t1"
          editingField="date"
          onEditCell={vi.fn()}
          onUpdateDraft={onUpdateDraft}
          onSave={onSave}
          onCancel={vi.fn()}
          onPreviewImage={vi.fn()}
          onDelete={vi.fn()}
          onClearFilters={vi.fn()}
          onToggleAccreditable={vi.fn()}
          savingAccreditableIds={new Set()}
        />,
      );
      expect(screen.getByLabelText('Editar fecha de Cafe')).toBeInTheDocument();
    }

    expect(onSave).not.toHaveBeenCalled();
    expect(onUpdateDraft).toHaveBeenCalled();
  });

  it('builds wire YYYY-MM-DD payload from display draft', () => {
    const baseline = createHistoryDraftFromTicket(backendTicket);
    const draft: HistoryTicketEditDraft = {
      ...baseline,
      date: '26/07/2026',
    };
    const result = buildHistoryTicketUpdatePayload(baseline, draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.date).toBe('2026-07-26T06:00:00.000Z');
    }
  });
});
