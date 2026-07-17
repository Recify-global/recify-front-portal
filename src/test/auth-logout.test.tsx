import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/use-auth';
import {
  markAuthSessionActive,
  registerSessionCacheCleanup,
  terminateAuthSession,
} from '@/auth/session-cleanup';
import {
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  setAuthSession,
} from '@/auth/storage';
import { loginRequest } from '@/services/auth.service';
import type { AuthResponse, AuthUser } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/services/auth.service', () => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
}));

const userA: AuthUser = {
  _id: 'user-a',
  name: 'Usuario A',
  email: 'a@recify.test',
  role: 'admin',
  companies: ['company-a', 'company-b'],
  status: 'active',
};

const userB: AuthUser = {
  ...userA,
  _id: 'user-b',
  name: 'Usuario B',
  email: 'b@recify.test',
  companies: ['company-b'],
};

function wrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  markAuthSessionActive();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('useAuth session lifecycle', () => {
  it('logs out idempotently, clears memory/storage and navigates once with replace', async () => {
    setAuthSession({ token: 'token-a', user: userA });
    markAuthSessionActive();
    const cacheCleanup = vi.fn(async () => undefined);
    const unregister = registerSessionCacheCleanup(cacheCleanup);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWithClient() });

    await act(async () => {
      const first = result.current.logout();
      const second = result.current.logout();
      expect(second).toBe(first);
      await Promise.all([first, second]);
    });

    expect(cacheCleanup).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/auth', { replace: true });
    expect(getStoredToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(getStoredCompanyId()).toBeNull();
    await waitFor(() => {
      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.companyId).toBeNull();
    });
    unregister();
  });

  it('does not navigate to auth if a newer session starts during delayed logout', async () => {
    setAuthSession({ token: 'token-a', user: userA });
    markAuthSessionActive();
    let releaseCleanup!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const unregister = registerSessionCacheCleanup(() => gate);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWithClient() });

    let logoutPromise!: Promise<void>;
    await act(async () => {
      logoutPromise = result.current.logout();
    });
    setAuthSession({ token: 'token-b', user: userB });
    markAuthSessionActive();
    releaseCleanup();
    await act(async () => {
      await logoutPromise;
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(getStoredToken()).toBe('token-b');
    expect(getStoredUser()).toEqual(userB);
    expect(getStoredCompanyId()).toBe('company-b');
    unregister();
  });

  it('keeps normal login working and starts with the returned company', async () => {
    const response: AuthResponse = { token: 'token-b', user: userB };
    vi.mocked(loginRequest).mockResolvedValueOnce(response);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWithClient() });

    await act(async () => {
      await result.current.login.mutateAsync({
        email: 'b@recify.test',
        password: 'secret',
      });
    });

    expect(getStoredToken()).toBe('token-b');
    expect(getStoredUser()).toEqual(userB);
    expect(getStoredCompanyId()).toBe('company-b');
    await waitFor(() => expect(result.current.user).toEqual(userB));
  });

  it('keeps company switching constrained to the authenticated user', () => {
    setAuthSession({ token: 'token-a', user: userA });
    markAuthSessionActive();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWithClient() });

    act(() => {
      result.current.setActiveCompany('company-b');
    });

    expect(getStoredCompanyId()).toBe('company-b');
    expect(result.current.companyId).toBe('company-b');
  });
});
