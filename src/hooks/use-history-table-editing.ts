import { useCallback, useMemo, useState } from 'react';
import type { BackendTicket } from '@/types/ticket';
import {
  buildHistoryTicketUpdatePayload,
  createHistoryDraftFromTicket,
  getHistoryTicketEditValidationMessage,
  hasHistoryTicketEditChanges,
  type HistoryTicketEditDraft,
} from '@/utils/ticket-edit';
import { formatCivilDateDisplay } from '@/utils/civil-date-input';
import { HISTORY_TIMEZONE } from '@/utils/financial-kpis';
import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';

export interface HistoryEditableTicket {
  id: string;
  companyId: string;
  ticket: BackendTicket;
}

export type HistoryEditableField =
  | 'vendor'
  | 'date'
  | 'amount'
  | 'tax'
  | 'paymentMethod'
  | 'type'
  | 'status'
  | 'category';

export type EditingCell = {
  ticketId: string;
  field: HistoryEditableField;
};

type DraftRecord = Record<string, HistoryTicketEditDraft>;
type ErrorRecord = Record<string, string>;

interface SaveHistoryDraftsOptions {
  ticketIds: string[];
  baselines: DraftRecord;
  drafts: DraftRecord;
  save: (ticketId: string, payload: DashboardDailyReportTicketUpdate) => Promise<void>;
}

export async function saveHistoryTicketDrafts({
  ticketIds,
  baselines,
  drafts,
  save,
}: SaveHistoryDraftsOptions): Promise<{ savedIds: string[]; errors: ErrorRecord }> {
  const savedIds: string[] = [];
  const errors: ErrorRecord = {};
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < ticketIds.length) {
      const ticketId = ticketIds[nextIndex];
      nextIndex += 1;
      const baseline = baselines[ticketId];
      const draft = drafts[ticketId];
      if (!baseline || !draft) continue;

      const result = buildHistoryTicketUpdatePayload(baseline, draft);
      if (result.ok === false) {
        if (result.reason === 'validation') errors[ticketId] = result.message;
        continue;
      }

      try {
        await save(ticketId, result.payload);
        savedIds.push(ticketId);
      } catch {
        errors[ticketId] =
          'No fue posible guardar este ticket. Revisa los datos e inténtalo nuevamente.';
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(2, ticketIds.length) }, worker),
  );
  return { savedIds, errors };
}

function openCellState(
  row: HistoryEditableTicket,
  field: HistoryEditableField,
  companyId: string,
  timeZone: string = HISTORY_TIMEZONE,
) {
  const draft = createHistoryDraftFromTicket(row.ticket, timeZone);
  const editingDraft =
    field === 'date'
      ? { ...draft, date: formatCivilDateDisplay(draft.date) || draft.date }
      : draft;
  return {
    editingCell: { ticketId: row.id, field } satisfies EditingCell,
    editingCompanyId: companyId,
    baselines: { [row.id]: draft },
    drafts: { [row.id]: editingDraft },
    rowErrors: {} as ErrorRecord,
  };
}

export function useHistoryTableEditing() {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<DraftRecord>({});
  const [drafts, setDrafts] = useState<DraftRecord>({});
  const [rowErrors, setRowErrors] = useState<ErrorRecord>({});

  const isEditing = editingCell !== null;

  const cancelEditing = useCallback(() => {
    setEditingCell(null);
    setEditingCompanyId(null);
    setBaselines({});
    setDrafts({});
    setRowErrors({});
  }, []);

  const activateCell = useCallback(
    (
      row: HistoryEditableTicket,
      field: HistoryEditableField,
      companyId: string,
      timeZone: string = HISTORY_TIMEZONE,
    ) => {
      if (row.companyId !== companyId) return;
      const next = openCellState(row, field, companyId, timeZone);
      setEditingCell(next.editingCell);
      setEditingCompanyId(next.editingCompanyId);
      setBaselines(next.baselines);
      setDrafts(next.drafts);
      setRowErrors(next.rowErrors);
    },
    [],
  );

  const dirtyTicketIds = useMemo(
    () =>
      Object.keys(drafts).filter((ticketId) => {
        const baseline = baselines[ticketId];
        const draft = drafts[ticketId];
        return Boolean(baseline && draft && hasHistoryTicketEditChanges(baseline, draft));
      }),
    [baselines, drafts],
  );

  const hasDirtyChanges = dirtyTicketIds.length > 0;

  const requestCellEdit = useCallback(
    (
      row: HistoryEditableTicket,
      field: HistoryEditableField,
      companyId: string,
      timeZone: string = HISTORY_TIMEZONE,
    ): 'activated' | 'same-cell' | 'needs-commit' | 'ignored' => {
      if (row.companyId !== companyId) return 'ignored';

      if (
        editingCell &&
        editingCell.ticketId === row.id &&
        editingCell.field === field
      ) {
        return 'same-cell';
      }

      if (editingCell && hasDirtyChanges) {
        return 'needs-commit';
      }

      activateCell(row, field, companyId, timeZone);
      return 'activated';
    },
    [activateCell, editingCell, hasDirtyChanges],
  );

  const updateDraft = useCallback(
    <K extends keyof HistoryTicketEditDraft>(
      ticketId: string,
      key: K,
      value: HistoryTicketEditDraft[K],
    ) => {
      setDrafts((current) => {
        const draft = current[ticketId];
        if (!draft) return current;
        return { ...current, [ticketId]: { ...draft, [key]: value } };
      });
      setRowErrors((current) => {
        if (!current[ticketId]) return current;
        const next = { ...current };
        delete next[ticketId];
        return next;
      });
    },
    [],
  );

  const updateDraftPatch = useCallback(
    (ticketId: string, patch: Partial<HistoryTicketEditDraft>) => {
      setDrafts((current) => {
        const draft = current[ticketId];
        if (!draft) return current;
        return { ...current, [ticketId]: { ...draft, ...patch } };
      });
      setRowErrors((current) => {
        if (!current[ticketId]) return current;
        const next = { ...current };
        delete next[ticketId];
        return next;
      });
    },
    [],
  );

  const validationErrors = useMemo(
    () =>
      dirtyTicketIds.reduce<ErrorRecord>((result, ticketId) => {
        const message = getHistoryTicketEditValidationMessage(drafts[ticketId]);
        if (message) result[ticketId] = message;
        return result;
      }, {}),
    [dirtyTicketIds, drafts],
  );

  const applySaveResults = useCallback((savedIds: string[], errors: ErrorRecord) => {
    if (Object.keys(errors).length === 0) {
      cancelEditing();
      return;
    }

    const saved = new Set(savedIds);
    setBaselines((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !saved.has(id))),
    );
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !saved.has(id))),
    );
    setRowErrors(errors);
    if (editingCell && saved.has(editingCell.ticketId)) {
      setEditingCell(null);
    }
  }, [cancelEditing, editingCell]);

  const isCellEditing = useCallback(
    (ticketId: string, field: HistoryEditableField) =>
      Boolean(editingCell && editingCell.ticketId === ticketId && editingCell.field === field),
    [editingCell],
  );

  return {
    isEditing,
    editingCell,
    editingCompanyId,
    baselines,
    drafts,
    dirtyTicketIds,
    hasDirtyChanges,
    validationErrors,
    rowErrors,
    requestCellEdit,
    activateCell,
    cancelEditing,
    updateDraft,
    updateDraftPatch,
    applySaveResults,
    isCellEditing,
  };
}
