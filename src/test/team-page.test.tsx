import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamPage from '@/pages/TeamPage';
import type { TeamMember } from '@/types/team';

const mocks = vi.hoisted(() => ({
  auth: {
    companyId: 'company-a',
    user: { _id: 'user-self' },
    canManage: true,
  },
  query: {
    data: undefined as
      | { data: TeamMember[]; total: number; page: number; limit: number; pages: number }
      | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  add: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  role: {
    isPending: false,
    variables: undefined as { memberId: string } | undefined,
    mutateAsync: vi.fn(),
  },
  remove: {
    isPending: false,
    variables: undefined as { memberId: string } | undefined,
    mutateAsync: vi.fn(),
  },
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/hooks/use-team-members', () => ({
  useTeamMembers: () => mocks.query,
  useAddTeamMember: () => mocks.add,
  useUpdateTeamMemberRole: () => mocks.role,
  useRemoveTeamMember: () => mocks.remove,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const activeMember: TeamMember = {
  id: 'membership-1',
  userId: 'user-self',
  kind: 'active',
  name: 'Tomás',
  email: 'tomas@recify.test',
  phone: '+52 55 1000 0000',
  rfc: 'TOMY••••••AB1',
  role: 'accountant',
  status: 'active',
  created_at: '2026-09-21T00:00:00.000Z',
  updated_at: '2026-09-21T00:00:00.000Z',
};

const pendingMember: TeamMember = {
  ...activeMember,
  id: 'pending-1',
  userId: null,
  kind: 'pending',
  name: 'Ana',
  email: 'ana@recify.test',
  rfc: null,
  role: 'viewer',
  status: 'pending',
};

beforeEach(() => {
  mocks.auth.companyId = 'company-a';
  mocks.auth.canManage = true;
  mocks.query.data = {
    data: [activeMember, pendingMember],
    total: 2,
    page: 1,
    limit: 20,
    pages: 1,
  };
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.query.refetch.mockReset();
  mocks.add.isPending = false;
  mocks.add.mutateAsync.mockReset();
  mocks.role.isPending = false;
  mocks.role.variables = undefined;
  mocks.role.mutateAsync.mockReset();
  mocks.remove.isPending = false;
  mocks.remove.variables = undefined;
  mocks.remove.mutateAsync.mockReset();
});

afterEach(cleanup);

describe('Mi equipo page', () => {
  it('renders active and pending members with exact role names and self badge', () => {
    render(<TeamPage />);
    expect(screen.getByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.getAllByText('accountant').length).toBeGreaterThan(0);
    expect(screen.getAllByText('viewer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tú').length).toBeGreaterThan(0);
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuario')).not.toBeInTheDocument();
  });

  it('keeps viewers read-only', () => {
    mocks.auth.canManage = false;
    render(<TeamPage />);
    expect(
      screen.queryByRole('button', { name: /Agregar integrante/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover a/i })).not.toBeInTheDocument();
  });

  it('shows loading, empty and error states', () => {
    mocks.query.isLoading = true;
    const view = render(<TeamPage />);
    expect(screen.getByLabelText('Cargando equipo')).toBeInTheDocument();

    mocks.query.isLoading = false;
    mocks.query.data = { data: [], total: 0, page: 1, limit: 20, pages: 0 };
    view.rerender(<TeamPage />);
    expect(
      screen.getByText('Todavía no hay integrantes adicionales en tu equipo.'),
    ).toBeInTheDocument();

    mocks.query.data = undefined;
    mocks.query.isError = true;
    view.rerender(<TeamPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo cargar el equipo de esta empresa.',
    );
  });

  it('validates add fields locally and submits the strict member payload', async () => {
    mocks.add.mutateAsync.mockResolvedValue({ member: pendingMember });
    render(<TeamPage />);
    fireEvent.click(screen.getByRole('button', { name: /Agregar integrante/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Agregar$/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio.');

    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Carlos' } });
    fireEvent.change(screen.getByLabelText('Email *'), {
      target: { value: 'CARLOS@EXAMPLE.COM ' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono *'), {
      target: { value: '+52 55 1234 5678' },
    });
    fireEvent.change(screen.getByLabelText('RFC'), {
      target: { value: 'gode561231gr8' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Agregar$/ }));

    await waitFor(() =>
      expect(mocks.add.mutateAsync).toHaveBeenCalledWith({
        companyId: 'company-a',
        input: {
          name: 'Carlos',
          email: 'carlos@example.com',
          phone: '+52 55 1234 5678',
          rfc: 'GODE561231GR8',
          role: 'viewer',
        },
      }),
    );
  });

  it('requires confirmation before removing company access', async () => {
    mocks.remove.mutateAsync.mockResolvedValue({
      id: activeMember.id,
      userId: activeMember.userId,
      kind: 'active',
    });
    render(<TeamPage />);
    fireEvent.click(
      screen.getAllByRole('button', { name: /Remover a Tomás del equipo/i })[0],
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Se removerá el acceso de Tomás a esta empresa.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover del equipo' }));
    await waitFor(() =>
      expect(mocks.remove.mutateAsync).toHaveBeenCalledWith({
        companyId: 'company-a',
        memberId: activeMember.id,
      }),
    );
  });
});
