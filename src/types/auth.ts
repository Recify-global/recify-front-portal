export type PlatformRole = 'admin' | null;
export type MembershipRole = 'accountant' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface CompanyMembership {
  membershipId: string;
  companyId: string;
  companyName: string;
  companyStatus: 'active' | 'suspended';
  companyTimezone: string;
  role: MembershipRole;
  status: 'active' | 'inactive';
}

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  memberships: CompanyMembership[];
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterCompanyInput {
  name: string;
  rfc: string;
  timezone?: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  company: RegisterCompanyInput;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface GoogleLinkRequest extends GoogleLoginRequest {
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
