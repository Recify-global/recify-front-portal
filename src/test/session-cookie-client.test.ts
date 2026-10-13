import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { apiRequest, ApiRequestError } from '@/api/http';
import { SessionCacheBoundary } from '@/auth/SessionCacheBoundary';
import { beginLogoutAbort } from '@/auth/session-cleanup';
import { probeSession } from '@/auth/session-probe';
import {
  AUTH_STORAGE_KEYS,
  getClientSession,
  getStoredCompanyId,
  getStoredUser,
  setAuthSession,
} from '@/auth/storage';
import { getMeRequest } from '@/services/auth.service';
import type { AuthUser } from '@/types/auth';

vi.mock('@/services/auth.service', () => ({
  getMeRequest: vi.fn(),
}));

const user: AuthUser = {
  _id: 'user-restore',
  name: 'Restaurar',
  email: 'restore@recify.test',
  platformRole: null,
  memberships: [
    {
      membershipId: 'membership-a',
      companyId: 'company-a',
      companyName: 'A',
      companyStatus: 'active',
      companyTimezone: 'America/Mexico_City',
      role: 'accountant',
      status: 'active',
    },
  ],
  status: 'active',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('cookie session client', () => {
  it('sends credentials on multipart upload and does not attach a Recify JWT', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ success: true, data: { kind: 'ticket' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.append('image', new File(['img'], 'ticket.png', { type: 'image/png' }));

    await apiRequest('/companies/company-a/upload/ticket', { method: 'POST', formData });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.body).toBe(formData);
  });

  it('purges only the legacy JWT and restores the profile from GET /auth/me', async () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, 'legacy-jwt');
    localStorage.setItem('recify.theme', 'dark');
    vi.mocked(getMeRequest).mockResolvedValueOnce({ user });

    await probeSession({ force: true });

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    expect(localStorage.getItem('recify.theme')).toBe('dark');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
    expect(getStoredUser()).toEqual(user);
    expect(getStoredCompanyId()).toBe('company-a');
    expect(getClientSession().status).toBe('authenticated');
  });

  it('treats 401 as anonymous, 403 as forbidden, and a network error as offline', async () => {
    vi.mocked(getMeRequest).mockRejectedValueOnce(new ApiRequestError('missing', 401));
    await probeSession({ force: true });
    expect(getClientSession().status).toBe('anonymous');

    vi.mocked(getMeRequest).mockRejectedValueOnce(new ApiRequestError('forbidden', 403));
    await probeSession({ force: true });
    expect(getClientSession().status).toBe('forbidden');

    vi.mocked(getMeRequest).mockRejectedValueOnce(new ApiRequestError('offline', 0));
    await probeSession({ force: true });
    expect(getClientSession().status).toBe('offline');
    expect(getStoredUser()).toBeNull();
  });

  it('adopts a remote logout and confirms a remote login with /auth/me', async () => {
    const client = new QueryClient();
    client.setQueryData(['company-a', 'tickets'], { private: true });
    setAuthSession(user);
    render(createElement(QueryClientProvider, { client }, createElement(SessionCacheBoundary)));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_STORAGE_KEYS.sessionSignal,
        newValue: 'out:1',
      }),
    );

    expect(getClientSession().status).toBe('anonymous');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    await waitFor(() => expect(client.getQueryData(['company-a', 'tickets'])).toBeUndefined());

    vi.mocked(getMeRequest).mockResolvedValueOnce({ user });
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_STORAGE_KEYS.sessionSignal,
        newValue: 'in:2',
      }),
    );

    await waitFor(() => expect(getStoredUser()?._id).toBe('user-restore'));
    expect(getMeRequest).toHaveBeenCalled();
  });

  it('aborts this tab’s in-flight logout when another tab signals a new session', () => {
    const signal = beginLogoutAbort();
    const client = new QueryClient();
    render(createElement(QueryClientProvider, { client }, createElement(SessionCacheBoundary)));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AUTH_STORAGE_KEYS.sessionSignal,
        newValue: 'in:3',
      }),
    );

    expect(signal.aborted).toBe(true);
  });
});
