import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  loginRequest,
  registerRequest,
  googleLoginRequest,
  googleLinkRequest,
  getMeRequest,
} from '@/services/auth.service';
import type {
  AuthResponse,
  GoogleLinkRequest,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth';
import {
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  setActiveCompany as persistActiveCompany,
  setAuthSession,
  updateStoredUser,
  subscribeAuthChanges,
} from '@/auth/storage';
import {
  captureAuthMutationContext,
  getActiveClosingGeneration,
  isAuthMutationContextCurrent,
  markAuthSessionActive,
  shouldFinalizeSessionCleanup,
  terminateAuthSession,
} from '@/auth/session-cleanup';

export { getStoredToken, getStoredUser, getStoredCompanyId } from '@/auth/storage';

function persistSession(data: AuthResponse): void {
  setAuthSession({ token: data.token, user: data.user });
  markAuthSessionActive();
}

function readSessionSnapshot() {
  const user = getStoredUser();
  if (!user) {
    return { token: null, user: null, companyId: null };
  }
  return {
    token: getStoredToken(),
    user,
    companyId: getStoredCompanyId(),
  };
}

export function useAuth() {
  const [session, setSession] = useState(readSessionSnapshot);
  const logoutClaimRef = useRef<Promise<void> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const sync = () => {
      const nextSession = readSessionSnapshot();
      if (nextSession.token) markAuthSessionActive();
      setSession(nextSession);
    };
    return subscribeAuthChanges(sync);
  }, []);

  const profile = useQuery({
    queryKey: ['auth', 'me', session.user?._id ?? null],
    queryFn: getMeRequest,
    enabled: Boolean(session.token && session.user),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (profile.data?.user) updateStoredUser(profile.data.user);
  }, [profile.data]);

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

  const logout = useCallback((): Promise<void> => {
    if (logoutClaimRef.current) return logoutClaimRef.current;

    const cleanupTask = terminateAuthSession();
    const closingGeneration = getActiveClosingGeneration();
    const task = cleanupTask
      .then(() => {
        if (
          closingGeneration !== null &&
          shouldFinalizeSessionCleanup(closingGeneration)
        ) {
          navigate('/auth', { replace: true });
        }
      })
      .finally(() => {
        logoutClaimRef.current = null;
      });
    logoutClaimRef.current = task;
    return task;
  }, [navigate]);

  const setActiveCompany = useCallback((nextCompanyId: string) => {
    persistActiveCompany(nextCompanyId);
  }, []);

  const activeMembership =
    session.user?.memberships.find(
      (membership) => membership.companyId === session.companyId,
    ) ?? null;

  return {
    token: session.token,
    user: session.user,
    companyId: session.companyId,
    isAuthenticated: Boolean(session.token),
    login,
    register,
    googleLogin,
    googleLink,
    logout,
    setActiveCompany,
    activeMembership,
    activeRole: activeMembership?.role ?? null,
    isPlatformAdmin: session.user?.platformRole === 'admin',
    canManage:
      session.user?.platformRole === 'admin' || activeMembership?.role === 'accountant',
  };
}
