import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/api/http';
import SettingsPage from '@/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  auth: { companyId: 'company-a', canManage: true },
  profile: {
    data: { _id: 'company-a', name: 'Empresa A', rfcMasked: 'EMA•010101•AB1', timezone: 'America/Mexico_City', status: 'active' as const },
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  update: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock('@/components/recify/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/hooks/use-company-settings', () => ({
  useCompanyProfile: () => mocks.profile,
  useUpdateCompanyName: () => mocks.update,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mocks.auth.companyId = 'company-a';
  mocks.auth.canManage = true;
  mocks.profile.data = {
    _id: 'company-a',
    name: 'Empresa A',
    rfcMasked: 'EMA•010101•AB1',
    timezone: 'America/Mexico_City',
    status: 'active',
  };
  mocks.profile.isLoading = false;
  mocks.profile.isError = false;
  mocks.profile.error = undefined;
  mocks.update.isPending = false;
  mocks.update.mutateAsync.mockReset();
});

afterEach(cleanup);

describe('company settings', () => {
  it('shows the name and masked RFC without an edit action for a viewer', () => {
    mocks.auth.canManage = false;
    render(<SettingsPage />);
    const companyName = screen.getByText('Empresa A');
    expect(companyName).toHaveAttribute('translate', 'no');
    expect(companyName).toHaveClass('notranslate');
    expect(screen.getByRole('heading', { name: 'Configuración' })).not.toHaveAttribute('translate', 'no');
    expect(screen.getByText('EMA•010101•AB1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar nombre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'RFC' })).not.toBeInTheDocument();
  });

  it('saves a trimmed name and cancels back to the current one', async () => {
    mocks.update.mutateAsync.mockResolvedValue({ name: 'Empresa Norte' });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar nombre' }));
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('translate', 'no');
    expect(screen.getByLabelText('Nombre')).toHaveClass('notranslate');
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio.');
    expect(mocks.update.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  Empresa Norte  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mocks.update.mutateAsync).toHaveBeenCalledWith({
        companyId: 'company-a',
        name: 'Empresa Norte',
      }),
    );

    cleanup();
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar nombre' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Borrador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Empresa A')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Borrador')).not.toBeInTheDocument();
  });

  it('does not show success when the update fails', async () => {
    const { toast } = await import('sonner');
    mocks.update.mutateAsync.mockRejectedValue(new ApiRequestError('No changes', 400));
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar nombre' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Falla' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No changes'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('drops an in-progress edit when the active company changes', () => {
    const view = render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar nombre' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Solo A' } });
    mocks.auth.companyId = 'company-b';
    mocks.profile.data = {
      ...mocks.profile.data,
      _id: 'company-b',
      name: 'Empresa B',
      rfcMasked: 'EMB•010101•AB1',
    };
    view.rerender(<SettingsPage />);
    expect(screen.getByText('Empresa B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Solo A')).not.toBeInTheDocument();
  });
});
