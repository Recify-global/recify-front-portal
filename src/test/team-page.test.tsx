import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamPage from '@/pages/TeamPage';
import type { TeamMember } from '@/types/team';
import { TeamContractUnavailableError } from '@/utils/team-errors';

const mocks = vi.hoisted(() => ({
  companyId: 'company-a' as string | null,
  userId: 'me',
  listTeamMembers: vi.fn(),
  updateTeamMemberRole: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    token: 'token',
    companyId: mocks.companyId,
    user: {
      _id: mocks.userId,
      name: 'Ana López',
      email: 'ana@recify.test',
      role: 'admin',
      companies: ['company-a'],
      status: 'active',
    },
  }),
}));

vi.mock('@/services/team.service', () => ({
  listTeamMembers: (...args: unknown[]) => mocks.listTeamMembers(...args),
  updateTeamMemberRole: (...args: unknown[]) => mocks.updateTeamMemberRole(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'me',
    email: 'ana@recify.test',
    role: 'admin',
    name: 'Ana López',
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <TeamPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  mocks.companyId = 'company-a';
  mocks.listTeamMembers.mockResolvedValue([
    member(),
    member({ id: 'u2', email: 'juan@recify.test', name: undefined, role: 'user' }),
  ]);
  mocks.updateTeamMemberRole.mockResolvedValue(member({ id: 'u2', email: 'juan@recify.test', role: 'admin' }));
});

afterEach(() => {
  cleanup();
});

describe('TeamPage', () => {
  it('shows members with email, name fallback and only admin/user roles', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.getByText('Ana López')).toBeInTheDocument();
    expect(screen.getAllByText('ana@recify.test').length).toBeGreaterThan(0);
    expect(screen.getAllByText('juan@recify.test').length).toBeGreaterThan(0);
    expect(screen.getByText('Tú')).toBeInTheDocument();

    const roleControls = screen.getAllByRole('combobox');
    expect(roleControls).toHaveLength(2);
    expect(roleControls[0]).toHaveTextContent('Administrador');
    expect(roleControls[1]).toHaveTextContent('Usuario');

    fireEvent.keyDown(roleControls[1], { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'Administrador' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Usuario' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /viewer|contador|owner/i })).not.toBeInTheDocument();
  });

  it('shows loading skeletons before data arrives', async () => {
    let resolveList!: (value: TeamMember[]) => void;
    mocks.listTeamMembers.mockImplementation(
      () =>
        new Promise<TeamMember[]>((resolve) => {
          resolveList = resolve;
        }),
    );

    renderPage();
    expect(screen.getByText('Cargando equipo')).toBeInTheDocument();

    resolveList([member()]);
    expect(await screen.findByText('Ana López')).toBeInTheDocument();
  });

  it('shows an empty state when there are no members', async () => {
    mocks.listTeamMembers.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Sin integrantes')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay miembros en tu equipo.')).toBeInTheDocument();
  });

  it('shows a recoverable error without technical details', async () => {
    mocks.listTeamMembers.mockRejectedValue(new TeamContractUnavailableError());
    renderPage();

    expect(await screen.findByText('No se pudo cargar el equipo')).toBeInTheDocument();
    expect(
      screen.getByText('El listado del equipo no está disponible por ahora.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText(/TeamContractUnavailableError|stack|\/companies\//i)).not.toBeInTheDocument();
  });

  it('disables the select while a role change is pending', async () => {
    let resolveUpdate!: (value: TeamMember) => void;
    mocks.updateTeamMemberRole.mockImplementation(
      () =>
        new Promise<TeamMember>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    renderPage();
    const controls = await screen.findAllByRole('combobox');
    fireEvent.keyDown(controls[1], { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Administrador' }));

    await waitFor(() => expect(mocks.updateTeamMemberRole).toHaveBeenCalledOnce());
    expect(controls[1]).toBeDisabled();
    expect(controls[0]).not.toBeDisabled();

    resolveUpdate(member({ id: 'u2', email: 'juan@recify.test', role: 'admin' }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Rol actualizado'));
  });

  it('keeps the previous role in the UI when the mutation fails', async () => {
    mocks.updateTeamMemberRole.mockRejectedValue(
      new TeamContractUnavailableError('No se pudo actualizar el rol por ahora.'),
    );

    renderPage();
    const controls = await screen.findAllByRole('combobox');
    expect(controls[1]).toHaveTextContent('Usuario');

    fireEvent.keyDown(controls[1], { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Administrador' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(controls[1]).toHaveTextContent('Usuario');
    expect(controls[1]).not.toBeDisabled();
  });

  it('does not show another company members after switching tenant', async () => {
    const { rerender } = renderPage();
    expect(await screen.findByText('Ana López')).toBeInTheDocument();

    mocks.companyId = 'company-b';
    mocks.listTeamMembers.mockResolvedValue([
      member({ id: 'b1', email: 'beta@recify.test', name: 'Beta Corp' }),
    ]);

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    rerender(
      <QueryClientProvider client={client}>
        <TeamPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Beta Corp')).toBeInTheDocument();
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument();
    expect(screen.queryByText('juan@recify.test')).not.toBeInTheDocument();
  });
});
