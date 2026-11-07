import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type {
  AuthResponse,
  AuthUser,
  GoogleLinkRequest,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
  RegisterCompanyInput,
} from '@/types/auth';

export async function loginRequest(payload: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(endpoints.auth.login(), {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

export async function registerRequest(payload: RegisterRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(endpoints.auth.register(), {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

export async function googleLoginRequest(payload: GoogleLoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(endpoints.auth.google(), {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

export async function googleLinkRequest(payload: GoogleLinkRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>(endpoints.auth.googleLink(), {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

export async function createFirstCompanyRequest(
  payload: RegisterCompanyInput,
): Promise<{ company: { _id: string; name: string }; user: AuthUser }> {
  return apiRequest<{ company: { _id: string; name: string }; user: AuthUser }>(
    endpoints.auth.company(),
    {
      method: 'POST',
      body: payload,
    },
  );
}

export async function getMeRequest(): Promise<{ user: AuthResponse['user'] }> {
  return apiRequest<{ user: AuthResponse['user'] }>(endpoints.auth.me());
}

export async function requestEmailVerification(): Promise<void> {
  await apiRequest<void>(endpoints.auth.emailVerification(), { method: 'POST' });
}

export async function confirmEmailVerification(token: string): Promise<void> {
  await apiRequest<void>(endpoints.auth.verifyEmail(), {
    method: 'POST',
    body: { token },
    auth: false,
  });
}

export async function forgotPasswordRequest(email: string): Promise<void> {
  await apiRequest<void>(endpoints.auth.forgotPassword(), {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export async function resetPasswordRequest(payload: { token: string; password: string }): Promise<void> {
  await apiRequest<void>(endpoints.auth.resetPassword(), {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

export async function logoutRequest(signal?: AbortSignal): Promise<void> {
  await apiRequest<void>(endpoints.auth.logout(), {
    method: 'POST',
    allowDuringSignOut: true,
    signal,
  });
}
