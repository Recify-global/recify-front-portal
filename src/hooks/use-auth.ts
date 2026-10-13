import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  loginRequest,
  registerRequest,
  googleLoginRequest,
  googleLinkRequest,
  getMeRequest,
  logoutRequest,
} from '@/services/auth.service';
import type {
  AuthResponse,
  GoogleLinkRequest,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth';
import {
  beginSigningOut,
  clearAuthSession,
  getClientSession,
  getStoredCompanyId,
  getStoredUser,
  markSignOutUnconfirmed,
  setActiveCompany as persistActiveCompany,
  setAuthSession,
  setProbeBlocked,
  subscribeAuthChanges,
  updateStoredUser,
} from '@/auth/storage';
import {
  abortInFlightLogout,
  captureAuthMutationContext,
  drainSessionCacheCleanup,
  finishLogoutAbort,
  beginLogoutAbort,
  getActiveClosingGeneration,
  isAuthMutationContextCurrent,
  markAuthSessionActive,
  openSignOut,
  releaseSignOutGeneration,
  shouldFinalizeSessionCleanup,
} from '@/auth/session-cleanup';
import { probeSession } from '@/auth/session-probe';

export function resumeFailedLogout(): Promise<void> {
  setProbeBlocked(false);
  markAuthSessionActive();
  return probeSession({ force: true });
}

export { getStoredUser, getStoredCompanyId } from '@/auth/storage';

const LOGOUT_UNCONFIRMED =
  'No se pudo revocar la sesión en el servidor. Tus datos locales ya se ocultaron.';

let logoutTask: Promise<void> | null = null;

function persistSession(data: AuthResponse): void {
  abortInFlightLogout();
  setAuthSession(data.user);
  markAuthSessionActive();
}

export function performLogout(navigate: (path: string, options: { replace: boolean }) => void): Promise<void> {
  if (logoutTask) return logoutTask;

  const signal = beginLogoutAbort();
  const task = (async () => {
    const closingGeneration = openSignOut();
    beginSigningOut();
    try {
      await drainSessionCacheCleanup();
      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;

      try {
        await logoutRequest(signal);
      } catch {
        if (signal.aborted || !shouldFinalizeSessionCleanup(closingGeneration)) return;
        markSignOutUnconfirmed(LOGOUT_UNCONFIRMED);
        return;
      }

      if (!shouldFinalizeSessionCleanup(closingGeneration)) return;
      clearAuthSession({ advanceGeneration: false });
      markAuthSessionActive();
      navigate('/auth', { replace: true });
    } finally {
      releaseSignOutGeneration(closingGeneration);
    }
  })();

  logoutTask = task.finally(() => {
    finishLogoutAbort(signal);
    logoutTask = null;
  });
  return logoutTask;
}

export function useClientSession() {
  return useSyncExternalStore(subscribeAuthChanges, getClientSession, getClientSession);
}

export function useAuth() {
  const session = useClientSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.status === 'loading') void probeSession();
  }, [session.status]);

  const profile = useQuery({
    queryKey: ['auth', 'me', session.user?._id ?? null],
    queryFn: getMeRequest,
    enabled: session.status === 'authenticated' && Boolean(session.user),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (profile.data?.user && session.status === 'authenticated') {
      updateStoredUser(profile.data.user);
    }
  }, [profile.data, session.status]);

  const login = useMutation({
    mutationFn: (payload: LoginRequest) => loginRequest(payload),
    onMutate: captureAuthMutationContext,
    onSuccess: (data, _variables, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      persistSession(data);
    },
  });

  const register = useMutation({
    mutationFn: (payload: RegisterRequest) => registerRequest(payload),
    onMutate: captureAuthMutationContext,
    onSuccess: (data, _variables, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      persistSession(data);
    },
  });

  const googleLogin = useMutation({
    mutationFn: (payload: GoogleLoginRequest) => googleLoginRequest(payload),
    onMutate: captureAuthMutationContext,
    onSuccess: (data, _variables, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      persistSession(data);
    },
  });

  const googleLink = useMutation({
    mutationFn: (payload: GoogleLinkRequest) => googleLinkRequest(payload),
    onMutate: captureAuthMutationContext,
    onSuccess: (data, _variables, context) => {
      if (!isAuthMutationContextCurrent(context)) return;
      persistSession(data);
    },
  });

  const logout = useCallback((): Promise<void> => performLogout(navigate), [navigate]);

  const resumeSession = useCallback(() => resumeFailedLogout(), []);

  const setActiveCompany = useCallback((nextCompanyId: string) => {
    persistActiveCompany(nextCompanyId);
  }, []);

  const activeMembership =
    session.user?.memberships.find(
      (membership) => membership.companyId === session.companyId,
    ) ?? null;

  return {
    user: session.user,
    companyId: session.companyId,
    status: session.status,
    logoutError: session.logoutError,
    revocationConfirmed: session.revocationConfirmed,
    isAuthenticated: session.status === 'authenticated',
    login,
    register,
    googleLogin,
    googleLink,
    logout,
    resumeSession,
    setActiveCompany,
    activeMembership,
    activeRole: activeMembership?.role ?? null,
    isPlatformAdmin: session.user?.platformRole === 'admin',
    canManage:
      session.user?.platformRole === 'admin' || activeMembership?.role === 'accountant',
  };
}

export function getSignOutGeneration(): number | null {
  return getActiveClosingGeneration();
}
