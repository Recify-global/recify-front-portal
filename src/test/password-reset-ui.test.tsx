import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { forgotPasswordRequest, resetPasswordRequest } from '@/services/auth.service';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/services/auth.service', () => ({
  forgotPasswordRequest: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

const renderForgot = () => render(
  <MemoryRouter initialEntries={['/auth/forgot-password']}>
    <Routes>
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth" element={<div>Pantalla de acceso</div>} />
    </Routes>
  </MemoryRouter>,
);

const renderReset = (token?: string) => {
  const search = token ? `?token=${token}` : '';
  return render(
    <MemoryRouter initialEntries={[`/auth/reset-password${search}`]}>
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.mocked(forgotPasswordRequest).mockReset();
  vi.mocked(resetPasswordRequest).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe('password recovery forms', () => {
  it('shows a generic result and does not say whether the account exists', async () => {
    vi.mocked(forgotPasswordRequest).mockResolvedValueOnce(undefined);
    renderForgot();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'ana@empresa.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Si existe una cuenta asociada a este correo, recibirás instrucciones para recuperar tu contraseña.',
      );
    });
    expect(forgotPasswordRequest).toHaveBeenCalledWith('ana@empresa.test');
    expect(screen.queryByText(/no existe|Google/i)).not.toBeInTheDocument();
  });

  it('requires a new password of 8 characters and a matching confirmation', async () => {
    renderReset('reset-token-value');
    expect(screen.queryByText('reset-token-value')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(toast.error).toHaveBeenCalledWith('La contraseña debe tener al menos 8 caracteres.');
    expect(resetPasswordRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'password456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(toast.error).toHaveBeenCalledWith('Las contraseñas no coinciden.');
    expect(resetPasswordRequest).not.toHaveBeenCalled();
  });

  it('saves a matching password and confirms without keeping the token on screen', async () => {
    vi.mocked(resetPasswordRequest).mockResolvedValueOnce(undefined);
    renderReset('secret-reset-token');
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tu contraseña se actualizó'));
    expect(resetPasswordRequest).toHaveBeenCalledWith({
      token: 'secret-reset-token',
      password: 'password123',
    });
    expect(screen.queryByText('secret-reset-token')).not.toBeInTheDocument();
  });
});
