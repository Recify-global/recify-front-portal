import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { EmailVerificationNotice } from '@/components/recify/EmailVerificationNotice';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import { ApiRequestError } from '@/api/http';

const authMocks = vi.hoisted(() => ({
  user: { emailVerified: false as boolean | undefined, email: 'ana@empresa.test' },
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

vi.mock('@/services/auth.service', () => ({
  requestEmailVerification: vi.fn(),
  confirmEmailVerification: vi.fn(),
  getMeRequest: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { confirmEmailVerification, requestEmailVerification } from '@/services/auth.service';

describe('email verification UI', () => {
  beforeEach(() => {
    authMocks.user = { emailVerified: false, email: 'ana@empresa.test' };
    vi.mocked(requestEmailVerification).mockReset();
    vi.mocked(confirmEmailVerification).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('asks an unverified user to confirm and reports a delivery failure', async () => {
    vi.mocked(requestEmailVerification).mockRejectedValueOnce(
      new ApiRequestError('Email delivery is temporarily unavailable', 503),
    );
    render(<EmailVerificationNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar correo' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'No pudimos enviar el correo de verificación. Inténtalo más tarde.',
      );
    });
  });

  it('hides the notice when the backend says the email is verified', () => {
    authMocks.user = { emailVerified: true, email: 'ana@empresa.test' };
    render(<EmailVerificationNotice />);
    expect(screen.queryByRole('button', { name: 'Reenviar correo' })).toBeNull();
  });

  it('shows an expired or used link without keeping the token in the page', async () => {
    vi.mocked(confirmEmailVerification).mockRejectedValueOnce(
      new ApiRequestError('Verification link is invalid or expired', 400),
    );
    render(
      <MemoryRouter initialEntries={['/auth/verify-email?token=abc123tokenvaluewithenoughlengthxxxx']}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'El enlace no es válido' })).toBeInTheDocument();
    expect(screen.queryByText(/abc123tokenvalue/)).toBeNull();
  });
});
