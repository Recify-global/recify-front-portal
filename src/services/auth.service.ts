import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type {
  AuthResponse,
  GoogleLoginRequest,
  LoginRequest,
  RegisterRequest,
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
