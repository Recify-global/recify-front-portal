import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardDailyReportTicketUpdate } from '@/types/dashboard';
import {
  financialKpiQueryKeyPrefix,
  invalidateTicketDerivedQueries,
  KPI_RELEVANT_TICKET_FIELDS,
  ticketUpdateAffectsFinancialKpis,
} from '@/utils/ticket-derived-queries';
import { buildHistoryTicketUpdatePayload } from '@/utils/ticket-edit';
import type { HistoryTicketEditDraft } from '@/utils/ticket-edit';

const baseline: HistoryTicketEditDraft = {
  type: 'egreso',
  date: '2026-07-16',
  time: '12:00',
  vendor: 'Café',
  amount: '100',
  tax: '16',
  category: 'Restaurantes',
  paymentMethod: 'card',
  status: 'processed',
};

describe('ticketUpdateAffectsFinancialKpis', () => {
  it.each(KPI_RELEVANT_TICKET_FIELDS)('treats %s as KPI-relevant', (field) => {
    const payload: DashboardDailyReportTicketUpdate = {};
    if (field === 'type') payload.type = 'ingreso';
    if (field === 'amount') payload.amount = 200;
    if (field === 'date') payload.date = '2026-07-01';
    if (field === 'paymentMethod') payload.paymentMethod = 'cash';
    expect(ticketUpdateAffectsFinancialKpis(payload)).toBe(true);
  });

  it('does not treat vendor-only updates as KPI-relevant', () => {
    expect(ticketUpdateAffectsFinancialKpis({ vendor: 'OXXO' })).toBe(false);
  });

  it('does not treat tax-only updates as KPI-relevant', () => {
    expect(ticketUpdateAffectsFinancialKpis({ tax: 20 })).toBe(false);
    expect(ticketUpdateAffectsFinancialKpis({ tax: null })).toBe(false);
  });

  it('does not treat isAccreditable-only updates as KPI-relevant', () => {
    expect(ticketUpdateAffectsFinancialKpis({ isAccreditable: true })).toBe(false);
  });

  it('does not treat category/status-only updates as KPI-relevant for /dashboard/kpis', () => {
    expect(ticketUpdateAffectsFinancialKpis({ category: 'Otro' })).toBe(false);
    expect(ticketUpdateAffectsFinancialKpis({ status: 'pending' })).toBe(false);
  });

  it('detects relevant fields from history payload builder', () => {
    const amountChange = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      amount: '250',
    });
    expect(amountChange.ok && 'payload' in amountChange).toBe(true);
    if (amountChange.ok && 'payload' in amountChange) {
      expect(ticketUpdateAffectsFinancialKpis(amountChange.payload)).toBe(true);
    }

    const vendorChange = buildHistoryTicketUpdatePayload(baseline, {
      ...baseline,
      vendor: 'Nuevo comercio',
    });
    expect(vendorChange.ok && 'payload' in vendorChange).toBe(true);
    if (vendorChange.ok && 'payload' in vendorChange) {
      expect(ticketUpdateAffectsFinancialKpis(vendorChange.payload)).toBe(false);
    }
  });
});

describe('invalidateTicketDerivedQueries', () => {
  it('invalidates dashboard-kpis for the origin company once', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      financialKpis: true,
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: financialKpiQueryKeyPrefix('company-a'),
    });
    expect(invalidate.mock.calls[0][0]?.queryKey?.[1]).toBe('company-a');
  });

  it('does not invalidate another company when targeting A', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      tickets: true,
      dailyReport: true,
      financialKpis: true,
    });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual([
      ['tickets', 'company-a'],
      ['dashboard-daily-report', 'company-a'],
      ['dashboard-kpis', 'company-a'],
    ]);
    expect(keys.every((key) => key?.[1] === 'company-a')).toBe(true);
  });

  it('skips KPI invalidation when the option is omitted', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      tickets: true,
      dailyReport: true,
    });

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(
      invalidate.mock.calls.some((call) => call[0]?.queryKey?.[0] === 'dashboard-kpis'),
    ).toBe(false);
  });

  it('no-ops without an origin company id', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await invalidateTicketDerivedQueries(queryClient, '', { financialKpis: true });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('marks inactive KPI queries stale without forcing a fetch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = [...financialKpiQueryKeyPrefix('company-a'), 'from', 'to'] as const;
    queryClient.setQueryData(key, { netBalance: 1 });
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      financialKpis: true,
    });

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(key)).toEqual({ netBalance: 1 });
  });
});

describe('history save KPI invalidation policy', () => {
  it('one relevant save yields one KPI invalidation decision', () => {
    const payloads: DashboardDailyReportTicketUpdate[] = [
      { amount: 10 },
      { vendor: 'X' },
    ];
    const shouldRefresh = payloads.some(ticketUpdateAffectsFinancialKpis);
    expect(shouldRefresh).toBe(true);
    expect(payloads.filter(ticketUpdateAffectsFinancialKpis)).toHaveLength(1);
  });

  it('vendor-only and accreditable-only batches do not refresh KPIs', () => {
    const payloads: DashboardDailyReportTicketUpdate[] = [
      { vendor: 'Solo comercio' },
      { isAccreditable: false },
    ];
    expect(payloads.some(ticketUpdateAffectsFinancialKpis)).toBe(false);
  });

  it('A→B still targets origin company A for KPI invalidation', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const originCompanyId = 'company-a';
    const activeCompanyId = 'company-b';

    await invalidateTicketDerivedQueries(queryClient, originCompanyId, {
      financialKpis: true,
    });

    expect(activeCompanyId).toBe('company-b');
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard-kpis', 'company-a'],
    });
  });
});
