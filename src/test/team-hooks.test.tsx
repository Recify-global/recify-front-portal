import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeamMembers, useUpdateTeamMemberRole } from '@/hooks/use-team';
import { listTeamMembers, updateTeamMemberRole } from '@/services/team.service';
import type { TeamMember } from '@/types/team';
import { teamMembersQueryKey } from '@/utils/team-queries';
import { TeamContractUnavailableError } from '@/utils/team-errors';

const authState = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  generation: 0,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ companyId: authState.companyId }),
}));

vi.mock('@/services/team.service', () => ({
  listTeamMembers: vi.fn(),
  updateTeamMemberRole: vi.fn(),
}));

vi.mock('@/auth/session-cleanup', () => ({
  captureAuthMutationContext: () => ({
    authSessionGeneration: authState.generation,
  }),
  isAuthMutationContextCurrent: (context: { authSessionGeneration: number }) =>
    context.authSessionGeneration === authState.generation,
}));

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'u1',
    email: 'ana@recify.test',
    role: 'user',
    name: 'Ana López',
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  authState.companyId = 'company-a';
  authState.generation = 0;
  vi.clearAllMocks();
});

describe('useTeamMembers', () => {
  beforeEach(() => {
    vi.mocked(listTeamMembers).mockResolvedValue([member()]);
  });

  it('does not fetch without companyId', () => {
    authState.companyId = null;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useTeamMembers(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(listTeamMembers).not.toHaveBeenCalled();
  });

  it('does not reuse members across companies', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(listTeamMembers)
      .mockResolvedValueOnce([member({ id: 'a', email: 'a@recify.test' })])
      .mockResolvedValueOnce([member({ id: 'b', email: 'b@recify.test' })]);

    const { result, rerender } = renderHook(() => useTeamMembers(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('a'));
    expect(queryClient.getQueryData(teamMembersQueryKey('company-a'))?.[0]?.id).toBe('a');

    authState.companyId = 'company-b';
    rerender();

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('b'));
    expect(result.current.data?.[0]?.id).not.toBe('a');
    expect(queryClient.getQueryData(teamMembersQueryKey('company-a'))?.[0]?.id).toBe('a');
    expect(queryClient.getQueryData(teamMembersQueryKey('company-b'))?.[0]?.id).toBe('b');
    expect(listTeamMembers).toHaveBeenCalledTimes(2);
  });

  it('passes AbortSignal to the service', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useTeamMembers(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(listTeamMembers).toHaveBeenCalledOnce());
    expect(vi.mocked(listTeamMembers).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('useUpdateTeamMemberRole', () => {
  it('writes and invalidates only the origin company', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(teamMembersQueryKey('company-a'), [member()]);
    queryClient.setQueryData(teamMembersQueryKey('company-b'), [
      member({ id: 'other', email: 'b@recify.test' }),
    ]);
    vi.mocked(updateTeamMemberRole).mockResolvedValue(member({ role: 'admin' }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTeamMemberRole(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        companyId: 'company-a',
        memberId: 'u1',
        role: 'admin',
      });
    });

    expect(queryClient.getQueryData<TeamMember[]>(teamMembersQueryKey('company-a'))?.[0]?.role).toBe(
      'admin',
    );
    expect(queryClient.getQueryData<TeamMember[]>(teamMembersQueryKey('company-b'))?.[0]?.role).toBe(
      'user',
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: teamMembersQueryKey('company-a') });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: teamMembersQueryKey('company-b') });
  });

  it('does not persist a failed role change in cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(teamMembersQueryKey('company-a'), [member()]);
    vi.mocked(updateTeamMemberRole).mockRejectedValue(new TeamContractUnavailableError());

    const { result } = renderHook(() => useUpdateTeamMemberRole(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          companyId: 'company-a',
          memberId: 'u1',
          role: 'admin',
        })
        .catch(() => undefined);
    });

    expect(queryClient.getQueryData<TeamMember[]>(teamMembersQueryKey('company-a'))?.[0]?.role).toBe(
      'user',
    );
  });
});
