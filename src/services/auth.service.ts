import { apiRequest } from '@/api/http';
import { endpoints } from '@/api/endpoints';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/types/auth';

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
