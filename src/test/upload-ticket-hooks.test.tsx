import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateDashboardTicket } from '@/hooks/use-tickets';
import { usePreprocessTicket, useUploadTicket } from '@/hooks/use-upload-ticket';
import { updateDashboardDailyReportTicket } from '@/services/dashboard.service';
import { preprocessTicket, uploadTicket } from '@/services/upload.service';
import type { BackendTicket } from '@/types/ticket';
import { DASHBOARD_ANALYTICS_QUERY_ROOTS } from '@/utils/ticket-derived-queries';

vi.mock('@/services/upload.service', () => ({
  preprocessTicket: vi.fn(),
  uploadTicket: vi.fn(),
}));

vi.mock('@/services/dashboard.service', () => ({
  getDashboardDailyReport: vi.fn(),
  updateDashboardDailyReportTicket: vi.fn(),
}));

const file = new File(['ticket'], 'ticket.png', { type: 'image/png' });
const backendTicket: BackendTicket = {
  _id: 'ticket-a',
  companyId: 'company-a',
  vendor: 'Comercio A',
  type: 'egreso',
  date: '2026-07-13T18:00:00.000Z',
  amount: 100,
  category: 'Pruebas',
  paymentMethod: 'card',
  status: 'processed',
  reviewStatus: 'pendiente',
  created_at: '2026-07-13T18:00:00.000Z',
  updated_at: '2026-07-13T18:00:00.000Z',
};

function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preprocessTicket).mockResolvedValue({
    ticket: { vendor: 'Comercio A' },
    ocrText: 'producto',
  });
  vi.mocked(uploadTicket).mockResolvedValue({
    ticket: backendTicket,
    imageUrl: '/ticket.png',
    ocrText: 'producto',
  });
  vi.mocked(updateDashboardDailyReportTicket).mockResolvedValue(backendTicket);
});

describe('upload mutations use explicit origin company', () => {
  it('passes company A and AbortSignal to preprocess', async () => {
    const queryClient = testQueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const controller = new AbortController();
    const { result } = renderHook(() => usePreprocessTicket(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        file,
        signal: controller.signal,
      });
    });

    expect(preprocessTicket).toHaveBeenCalledWith('company-a', file, {
      signal: controller.signal,
    });
  });

  it('passes company A to upload and invalidates only A', async () => {
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const controller = new AbortController();
    const { result } = renderHook(() => useUploadTicket(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        file,
        signal: controller.signal,
      });
    });

    expect(uploadTicket).toHaveBeenCalledWith('company-a', file, {
      signal: controller.signal,
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets', 'company-a'] });
      for (const root of DASHBOARD_ANALYTICS_QUERY_ROOTS) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [root, 'company-a'] });
      }
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['tickets', 'company-b'] });
    expect(
      invalidate.mock.calls.some((call) => call[0]?.queryKey?.[1] === 'company-b'),
    ).toBe(false);
  });

  it('rejects a missing origin before calling a service', async () => {
    const queryClient = testQueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadTicket(), { wrapper });

    await expect(
      result.current.mutateAsync({ companyId: '', file }),
    ).rejects.toThrow('No hay compañía activa');
    expect(uploadTicket).not.toHaveBeenCalled();
  });
});

describe('ticket edit Dashboard invalidation', () => {
  it('invalidates analytics for the edited ticket company', async () => {
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateDashboardTicket(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        ticketId: 'ticket-a',
        payload: { vendor: 'Proveedor actualizado' },
      });
    });

    for (const root of DASHBOARD_ANALYTICS_QUERY_ROOTS) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [root, 'company-a'] });
    }
    expect(
      invalidate.mock.calls.some((call) => call[0]?.queryKey?.[1] === 'company-b'),
    ).toBe(false);
  });
});
