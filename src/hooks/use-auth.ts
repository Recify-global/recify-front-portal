import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loginRequest, registerRequest } from '@/services/auth.service';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth';
import {
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  setActiveCompany as persistActiveCompany,
  setAuthSession,
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

  return {
    token: session.token,
    user: session.user,
    companyId: session.companyId,
    isAuthenticated: Boolean(session.token),
    login,
    register,
    logout,
    setActiveCompany,
  };
}
