export type UserRole = 'admin' | 'accountant' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  companies: string[];
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  companies?: string[];
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
