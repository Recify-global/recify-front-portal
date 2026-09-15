import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import AuthPage from '@/pages/AuthPage';
import { AUTH_STORAGE_KEYS, getStoredCompanyId, getStoredToken, getStoredUser } from '@/auth/storage';
import { markAuthSessionActive } from '@/auth/session-cleanup';
import { registerRequest } from '@/services/auth.service';
import type { AuthResponse, AuthUser } from '@/types/auth';
import { ApiRequestError } from '@/api/http';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock('@/services/auth.service', () => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
  googleLoginRequest: vi.fn(),
}));

vi.mock('@/components/recify/GoogleSignInButton', () => ({
  GoogleSignInButton: () => null,
}));

const owner: AuthUser = {
  _id: 'user-register',
  name: 'Ana Founder',
  email: 'ana@empresa.test',
  role: 'accountant',
  companies: ['company-new'],
  status: 'active',
};

const successResponse: AuthResponse = {
  token: 'recify-jwt-register',
  user: owner,
};

function renderAuthPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getFormSubmitButton(name: string) {
  return screen.getAllByRole('button', { name }).find((element) => element.getAttribute('type') === 'submit');
}

function openRegisterTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

function fillRegisterForm({
  name = 'Ana Founder',
  email = 'ana@empresa.test',
  password = 'password123',
  companyName = 'Empresa Ana',
  rfc = 'XAXX010101000',
} = {}) {
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Nombre de la empresa'), { target: { value: companyName } });
  fireEvent.change(screen.getByLabelText('RFC'), { target: { value: rfc } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  markAuthSessionActive();
  vi.clearAllMocks();
  vi.spyOn(toast, 'error').mockImplementation(() => 'toast');
  vi.spyOn(toast, 'info').mockImplementation(() => 'toast');
  vi.mocked(registerRequest).mockResolvedValue(successResponse);
});

afterEach(() => {
  cleanup();
});

describe('Register onboarding UI', () => {
  it('shows account and company fields on the register tab', () => {
    renderAuthPage();
    openRegisterTab();

    expect(screen.getByText('Tu cuenta')).toBeInTheDocument();
    expect(screen.getByText('Datos de tu empresa')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la empresa')).toBeInTheDocument();
    expect(screen.getByLabelText('RFC')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tipo de negocio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Teléfono/)).not.toBeInTheDocument();
  });

  it('sends a single register request with company data and no privilege fields', async () => {
    renderAuthPage();
    openRegisterTab();
    fillRegisterForm();
    fireEvent.click(getFormSubmitButton('Crear cuenta y empresa')!);

    await waitFor(() => {
      expect(registerRequest).toHaveBeenCalledTimes(1);
    });

    expect(registerRequest).toHaveBeenCalledWith({
      name: 'Ana Founder',
      email: 'ana@empresa.test',
      password: 'password123',
      company: {
        name: 'Empresa Ana',
        rfc: 'XAXX010101000',
      },
    });

    const payload = vi.mocked(registerRequest).mock.calls[0][0];
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('companies');
    expect(payload).not.toHaveProperty('googleId');
    expect(payload).not.toHaveProperty('status');
  });

  it('persists the session, selects the new company and navigates to upload', async () => {
    renderAuthPage();
    openRegisterTab();
    fillRegisterForm();
    fireEvent.click(getFormSubmitButton('Crear cuenta y empresa')!);

    await waitFor(() => {
      expect(getStoredToken()).toBe('recify-jwt-register');
    });
    expect(getStoredUser()?._id).toBe('user-register');
    expect(getStoredCompanyId()).toBe('company-new');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.companyId)).toBe('company-new');
    expect(routerMocks.navigate).toHaveBeenCalledWith('/app/upload', { replace: true });
  });

  it('shows the duplicate-email error and does not navigate', async () => {
    vi.mocked(registerRequest).mockRejectedValueOnce(
      new ApiRequestError('Email already in use', 409),
    );

    renderAuthPage();
    openRegisterTab();
    fillRegisterForm({ email: 'dup@empresa.test' });
    fireEvent.click(getFormSubmitButton('Crear cuenta y empresa')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email already in use');
    });
    expect(getStoredToken()).toBeNull();
    expect(routerMocks.navigate).not.toHaveBeenCalledWith('/app/upload', { replace: true });
  });

  it('validates required fields before calling the API', async () => {
    renderAuthPage();
    openRegisterTab();
    fireEvent.click(getFormSubmitButton('Crear cuenta y empresa')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Completa tu nombre, correo, contraseña, empresa y RFC.',
      );
    });
    expect(registerRequest).not.toHaveBeenCalled();
  });

  it('validates RFC format before calling the API', async () => {
    renderAuthPage();
    openRegisterTab();
    fillRegisterForm({ rfc: 'NO-RFC' });
    fireEvent.click(getFormSubmitButton('Crear cuenta y empresa')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Ingresa un RFC válido de 12 o 13 caracteres.');
    });
    expect(registerRequest).not.toHaveBeenCalled();
  });

  it('disables submit while pending and ignores a second submit', async () => {
    let resolveRegister: (value: AuthResponse) => void = () => undefined;
    vi.mocked(registerRequest).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve;
        }),
    );

    renderAuthPage();
    openRegisterTab();
    fillRegisterForm();
    const submit = getFormSubmitButton('Crear cuenta y empresa')!;
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(registerRequest).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
    fireEvent.click(submit);
    expect(registerRequest).toHaveBeenCalledTimes(1);

    resolveRegister(successResponse);
    await waitFor(() => {
      expect(getStoredToken()).toBe('recify-jwt-register');
    });
  });
});
