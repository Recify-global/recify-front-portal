import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loginRequest, registerRequest } from '@/services/auth.service';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth';
import {
  clearAuthSession,
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  setAuthSession,
  subscribeAuthChanges,
} from '@/auth/storage';

export { getStoredToken, getStoredUser, getStoredCompanyId } from '@/auth/storage';

function persistSession(data: AuthResponse): void {
  setAuthSession({ token: data.token, user: data.user });
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [companyId, setCompanyId] = useState<string | null>(() => getStoredCompanyId());
  const navigate = useNavigate();

  useEffect(() => {
    const sync = () => {
      setToken(getStoredToken());
      setUser(getStoredUser());
      setCompanyId(getStoredCompanyId());
    };
    return subscribeAuthChanges(sync);
  }, []);

  const login = useMutation({
    mutationFn: (payload: LoginRequest) => loginRequest(payload),
    onSuccess: (data) => persistSession(data),
  });

  const register = useMutation({
    mutationFn: (payload: RegisterRequest) => registerRequest(payload),
    onSuccess: (data) => persistSession(data),
  });

  const logout = useCallback(() => {
    clearAuthSession();
    navigate('/auth', { replace: true });
  }, [navigate]);

  return {
    token,
    user,
    companyId,
    isAuthenticated: Boolean(token),
    login,
    register,
    logout,
  };
}
