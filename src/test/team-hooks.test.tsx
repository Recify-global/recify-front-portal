import { type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAddTeamMember,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateTeamMemberRole,
} from '@/hooks/use-team-members';
import { teamMembersQueryKey } from '@/utils/team-queries';
import type { TeamMember } from '@/types/team';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a',
  list: vi.fn(),
  add: vi.fn(),
  updateRole: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: mocks.companyId }),
}));

vi.mock('@/services/team.service', () => ({
  listTeamMembers: mocks.list,
  addTeamMember: mocks.add,
  updateTeamMemberRole: mocks.updateRole,
  removeTeamMember: mocks.remove,
}));

const member = (companyId: string): TeamMember => ({
  id: `membership-${companyId}`,
  userId: `user-${companyId}`,
  kind: 'active',
  name: `Member ${companyId}`,
  email: `${companyId}@recify.test`,
  phone: '+52 55 1234 5678',
  rfc: null,
  role: 'viewer',
  status: 'active',
  created_at: '2026-09-21T00:00:00.000Z',
  updated_at: '2026-09-21T00:00:00.000Z',
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  mocks.companyId = 'company-a';
  mocks.list.mockReset();
  mocks.add.mockReset();
  mocks.updateRole.mockReset();
  mocks.remove.mockReset();
});

afterEach(cleanup);

describe('team hooks', () => {
  it('keys data by company and never flashes company A while B loads', async () => {
    let resolveCompanyB:
      | ((value: {
          data: TeamMember[];
          total: number;
          page: number;
          limit: number;
          pages: number;
        }) => void)
      | undefined;
    mocks.list.mockImplementation((companyId: string) => {
      if (companyId === 'company-a') {
        return Promise.resolve({
          data: [member('company-a')],
          total: 1,
          page: 1,
          limit: 20,
          pages: 1,
        });
      }
      return new Promise((resolve) => {
        resolveCompanyB = resolve;
      });
    });
    const { Wrapper } = createWrapper();
    const hook = renderHook(() => useTeamMembers({ page: 1, limit: 20 }), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(hook.result.current.data?.data[0].name).toBe('Member company-a'),
    );

    mocks.companyId = 'company-b';
    hook.rerender();
    expect(hook.result.current.data).toBeUndefined();

    await act(async () => {
      resolveCompanyB?.({
        data: [member('company-b')],
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      });
    });
    await waitFor(() =>
      expect(hook.result.current.data?.data[0].name).toBe('Member company-b'),
    );
    expect(mocks.list).toHaveBeenNthCalledWith(
      1,
      'company-a',
      { page: 1, limit: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      'company-b',
      { page: 1, limit: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('scopes add, role and remove mutations and refreshes team/auth queries', async () => {
    const added = { member: member('company-a') };
    mocks.add.mockResolvedValue(added);
    mocks.updateRole.mockResolvedValue({ ...added.member, role: 'accountant' });
    mocks.remove.mockResolvedValue({
      id: added.member.id,
      userId: added.member.userId,
      kind: 'active',
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const addHook = renderHook(() => useAddTeamMember(), { wrapper: Wrapper });
    const roleHook = renderHook(() => useUpdateTeamMemberRole(), { wrapper: Wrapper });
    const removeHook = renderHook(() => useRemoveTeamMember(), { wrapper: Wrapper });

    await act(async () => {
      await addHook.result.current.mutateAsync({
        companyId: 'company-a',
        input: {
          name: 'Ana',
          email: 'ana@recify.test',
          phone: '+52 55 1234 5678',
          role: 'viewer',
        },
      });
      await roleHook.result.current.mutateAsync({
        companyId: 'company-a',
        memberId: added.member.id,
        role: 'accountant',
      });
      await removeHook.result.current.mutateAsync({
        companyId: 'company-a',
        memberId: added.member.id,
      });
    });

    expect(mocks.add).toHaveBeenCalledWith(
      'company-a',
      expect.objectContaining({ role: 'viewer' }),
    );
    expect(mocks.updateRole).toHaveBeenCalledWith(
      'company-a',
      added.member.id,
      'accountant',
    );
    expect(mocks.remove).toHaveBeenCalledWith('company-a', added.member.id);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: teamMembersQueryKey('company-a'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
  });
});
