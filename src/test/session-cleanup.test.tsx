import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionCacheBoundary } from '@/auth/SessionCacheBoundary';
import {
  markAuthSessionActive,
  registerSessionCacheCleanup,
  terminateAuthSession,
} from '@/auth/session-cleanup';
import {
  AUTH_STORAGE_KEYS,
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  setAuthSession,
} from '@/auth/storage';
import { apiRequest, ApiRequestError } from '@/api/http';
import type { AuthUser } from '@/types/auth';

const userA: AuthUser = {
  _id: 'user-a',
  name: 'Usuario A',
  email: 'a@recify.test',
  role: 'admin',
  companies: ['company-a'],
  status: 'active',
};

function seedSession() {
  setAuthSession({ token: 'token-a', user: userA });
  markAuthSessionActive();
}

beforeEach(() => {
  localStorage.clear();
  markAuthSessionActive();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('session cache cleanup', () => {
  it('cancels active queries and clears the real QueryClient caches', async () => {
    seedSession();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tickets', 'company-a'], [{ id: 'secret-a' }]);
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['save', 'company-a'],
      mutationFn: async () => undefined,
    });
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const clearClient = vi.spyOn(queryClient, 'clear');

    render(
      <QueryClientProvider client={queryClient}>
        <SessionCacheBoundary />
      </QueryClientProvider>,
    );

    await act(async () => {
      await terminateAuthSession();
    });

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(clearClient).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('clears auth storage even when query cancellation fails', async () => {
    seedSession();
    const unregister = registerSessionCacheCleanup(async () => {
      throw new Error('cancel failed');
    });

    await terminateAuthSession();

    expect(getStoredToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(getStoredCompanyId()).toBeNull();
    unregister();
  });

  it('does not remove unrelated local preferences', async () => {
    seedSession();
    localStorage.setItem('recify.theme', 'dark');
    const unregister = registerSessionCacheCleanup(async () => undefined);

    await terminateAuthSession();

    expect(localStorage.getItem('recify.theme')).toBe('dark');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.user)).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.companyId)).toBeNull();
    unregister();
  });

  it('prevents a late query response from repopulating cleared cache', async () => {
    seedSession();
    const queryClient = new QueryClient();
    let resolveQuery!: (value: string) => void;
    const lateResult = new Promise<string>((resolve) => {
      resolveQuery = resolve;
    });
    const request = queryClient.fetchQuery({
      queryKey: ['tickets', 'company-a'],
      queryFn: () => lateResult,
    }).catch(() => undefined);
    const unregister = registerSessionCacheCleanup(async () => {
      try {
        await queryClient.cancelQueries();
      } finally {
        queryClient.clear();
      }
    });

    await terminateAuthSession();
    resolveQuery('secret-a');
    await request;

    expect(queryClient.getQueryData(['tickets', 'company-a'])).toBeUndefined();
    unregister();
  });

  it('starts a new user with no cache from the previous session', async () => {
    seedSession();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tickets', 'company-a'], ['secret-a']);
    const unregister = registerSessionCacheCleanup(async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
    });

    await terminateAuthSession();
    setAuthSession({
      token: 'token-b',
      user: { ...userA, _id: 'user-b', email: 'b@recify.test', companies: ['company-b'] },
    });
    markAuthSessionActive();

    expect(queryClient.getQueryData(['tickets', 'company-a'])).toBeUndefined();
    expect(queryClient.getQueryData(['tickets', 'company-b'])).toBeUndefined();
    unregister();
  });
});

describe('storage integrity', () => {
  it('removes the complete auth session for corrupt or arbitrary user JSON', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, 'token-a');
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify({ arbitrary: true }));
    localStorage.setItem(AUTH_STORAGE_KEYS.companyId, 'company-a');
    localStorage.setItem('recify.theme', 'dark');

    expect(getStoredUser()).toBeNull();
    expect(getStoredToken()).toBeNull();
    expect(getStoredCompanyId()).toBeNull();
    expect(localStorage.getItem('recify.theme')).toBe('dark');
  });
});

describe('HTTP auth status cleanup', () => {
  it('deduplicates simultaneous 401 cleanup', async () => {
    seedSession();
    let releaseCleanup!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const cacheCleanup = vi.fn(() => gate);
    const unregister = registerSessionCacheCleanup(cacheCleanup);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )));

    const requests = [
      apiRequest('/companies'),
      apiRequest('/companies'),
    ];
    const resultsPromise = Promise.allSettled(requests);
    await waitFor(() => expect(cacheCleanup).toHaveBeenCalledOnce());
    releaseCleanup();
    const results = await resultsPromise;

    expect(results.every((result) =>
      result.status === 'rejected' &&
      result.reason instanceof ApiRequestError &&
      result.reason.status === 401,
    )).toBe(true);
    expect(cacheCleanup).toHaveBeenCalledOnce();
    expect(getStoredToken()).toBeNull();
    unregister();
  });

  it('does not clear the session on 403', async () => {
    seedSession();
    const cacheCleanup = vi.fn(async () => undefined);
    const unregister = registerSessionCacheCleanup(cacheCleanup);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(apiRequest('/companies')).rejects.toMatchObject({ status: 403 });

    expect(cacheCleanup).not.toHaveBeenCalled();
    expect(getStoredToken()).toBe('token-a');
    expect(getStoredCompanyId()).toBe('company-a');
    unregister();
  });
});
