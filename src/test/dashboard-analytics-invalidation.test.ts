import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_ANALYTICS_QUERY_ROOTS,
  invalidateTicketDerivedQueries,
  ticketUpdateAffectsDashboardAnalytics,
} from '@/utils/ticket-derived-queries';

function analyticsKeysFor(companyId: string) {
  return DASHBOARD_ANALYTICS_QUERY_ROOTS.map((root) => [root, companyId]);
}

describe('ticket Dashboard analytics invalidation', () => {
  it.each(['create', 'delete'])('%s invalidates every analytics key for the origin company', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      dashboardAnalytics: true,
    });

    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
      analyticsKeysFor('company-a'),
    );
  });

  it('edit invalidates analytics when a dependent ticket field changes', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const payload = { vendor: 'Proveedor actualizado' };

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      dashboardAnalytics: ticketUpdateAffectsDashboardAnalytics(payload),
    });

    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual(
      analyticsKeysFor('company-a'),
    );
  });

  it('does not invalidate analytics for an unrelated ticket field', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      dashboardAnalytics: ticketUpdateAffectsDashboardAnalytics({
        reviewStatus: 'revisado',
      }),
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('never targets another company', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTicketDerivedQueries(queryClient, 'company-a', {
      dashboardAnalytics: true,
    });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys.every((key) => key?.[1] === 'company-a')).toBe(true);
    expect(keys).not.toContainEqual(expect.arrayContaining(['company-b']));
  });
});
