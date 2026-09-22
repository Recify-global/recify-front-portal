import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SelectCompanyPage from '@/pages/SelectCompanyPage';
import {
  AUTH_STORAGE_KEYS,
  getActiveMembership,
  getStoredCompanyId,
  setActiveCompany,
  setAuthSession,
  updateStoredUser,
} from '@/auth/storage';
import type { AuthUser, CompanyMembership } from '@/types/auth';

vi.mock('@/services/auth.service', () => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  googleLoginRequest: vi.fn(),
  googleLinkRequest: vi.fn(),
  getMeRequest: vi.fn(() => new Promise(() => {})),
}));

const membership = (
  companyId: string,
  role: CompanyMembership['role'],
): CompanyMembership => ({
  membershipId: `membership-${companyId}`,
  companyId,
  companyName: `Empresa ${companyId.toUpperCase()}`,
  companyStatus: 'active',
  companyTimezone: 'America/Mexico_City',
  role,
  status: 'active',
});

const user = (memberships: CompanyMembership[]): AuthUser => ({
  _id: 'multi-user',
  name: 'Usuario Multi',
  email: 'multi@recify.test',
  platformRole: null,
  memberships,
  status: 'active',
});

const seed = (memberships: CompanyMembership[]) =>
  setAuthSession({ token: 'recify-token', user: user(memberships) });

const renderSelector = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/select-company']}>
        <Routes>
          <Route path="/select-company" element={<SelectCompanyPage />} />
          <Route path="/app/upload" element={<div>Portal upload</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('multi-company session selection', () => {
  it('keeps zero memberships without inventing a company', () => {
    seed([]);
    expect(getStoredCompanyId()).toBeNull();
    renderSelector();
    expect(screen.getByText('Tu cuenta aún no tiene empresa')).toBeInTheDocument();
  });

  it('auto-selects the only membership', async () => {
    seed([membership('a', 'accountant')]);
    expect(getStoredCompanyId()).toBe('a');
    renderSelector();
    await waitFor(() => expect(screen.getByText('Portal upload')).toBeInTheDocument());
  });

  it('requires an explicit choice for two memberships and switches active role', async () => {
    seed([membership('a', 'accountant'), membership('b', 'viewer')]);
    expect(getStoredCompanyId()).toBeNull();
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /Empresa B/ }));
    await waitFor(() => expect(screen.getByText('Portal upload')).toBeInTheDocument());
    expect(getStoredCompanyId()).toBe('b');
    expect(getActiveMembership()?.role).toBe('viewer');
  });

  it('discards a stale company id that is not in memberships', () => {
    seed([membership('a', 'accountant'), membership('b', 'viewer')]);
    localStorage.setItem(AUTH_STORAGE_KEYS.companyId, 'foreign-company');
    expect(getStoredCompanyId()).toBeNull();
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.companyId)).toBeNull();
  });

  it('replaces a revoked active company with the only refreshed membership', () => {
    const companyA = membership('a', 'accountant');
    seed([companyA, membership('b', 'viewer')]);
    setActiveCompany('b');

    updateStoredUser(user([companyA]));

    expect(getStoredCompanyId()).toBe('a');
    expect(getActiveMembership()?.role).toBe('accountant');
  });
});
