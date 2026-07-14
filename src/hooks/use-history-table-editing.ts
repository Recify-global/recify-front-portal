import { useCallback, useMemo, useState } from 'react';
import type { BackendTicket } from '@/types/ticket';
import {
  buildHistoryTicketUpdatePayload,
  createHistoryDraftFromTicket,
  getHistoryTicketEditValidationMessage,
  hasHistoryTicketEditChanges,
  type HistoryTicketEditDraft,
} from '@/utils/ticket-edit';
import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';

export interface HistoryEditableTicket {
  id: string;
  companyId: string;
  ticket: BackendTicket;
}

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
      if (!result.ok) {
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

export function useHistoryTableEditing() {
  const [isTableEditing, setIsTableEditing] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [baselines, setBaselines] = useState<DraftRecord>({});
  const [drafts, setDrafts] = useState<DraftRecord>({});
  const [rowErrors, setRowErrors] = useState<ErrorRecord>({});

  const startEditing = useCallback((rows: HistoryEditableTicket[], companyId: string) => {
    const next = rows.reduce<DraftRecord>((result, row) => {
      if (row.companyId === companyId) {
        result[row.id] = createHistoryDraftFromTicket(row.ticket);
      }
      return result;
    }, {});
    setEditingCompanyId(companyId);
    setBaselines(next);
    setDrafts(next);
    setRowErrors({});
    setIsTableEditing(true);
  }, []);

  const cancelEditing = useCallback(() => {
    setIsTableEditing(false);
    setEditingCompanyId(null);
    setBaselines({});
    setDrafts({});
    setRowErrors({});
  }, []);

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

  const dirtyTicketIds = useMemo(
    () =>
      Object.keys(drafts).filter((ticketId) => {
        const baseline = baselines[ticketId];
        const draft = drafts[ticketId];
        return Boolean(baseline && draft && hasHistoryTicketEditChanges(baseline, draft));
      }),
    [baselines, drafts],
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
  }, [cancelEditing]);

  return {
    isTableEditing,
    editingCompanyId,
    baselines,
    drafts,
    dirtyTicketIds,
    validationErrors,
    rowErrors,
    startEditing,
    cancelEditing,
    updateDraft,
    updateDraftPatch,
    applySaveResults,
  };
}
