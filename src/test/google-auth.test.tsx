import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import AuthPage from '@/pages/AuthPage';
import { useAuth } from '@/hooks/use-auth';
import { AUTH_STORAGE_KEYS, getStoredCompanyId, getStoredToken, getStoredUser } from '@/auth/storage';
import { markAuthSessionActive } from '@/auth/session-cleanup';
import { googleLoginRequest, loginRequest } from '@/services/auth.service';
import type { AuthResponse, AuthUser } from '@/types/auth';
import type { GoogleCredentialResponse, GoogleIdentityServices } from '@/types/google-gis';
import { ApiRequestError } from '@/api/http';

const identityMocks = vi.hoisted(() => ({
  loadGoogleIdentityScript: vi.fn(async () => undefined),
  getGoogleClientId: vi.fn(() => 'test-google-client-id.apps.googleusercontent.com'),
}));

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

vi.mock('@/lib/google-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/google-identity')>();
  return {
    ...actual,
    getGoogleClientId: identityMocks.getGoogleClientId,
    loadGoogleIdentityScript: identityMocks.loadGoogleIdentityScript,
  };
});

const user: AuthUser = {
  _id: 'user-google',
  name: 'Usuario Google',
  email: 'google@recify.test',
  role: 'accountant',
  companies: ['company-a'],
  status: 'active',
};

const successResponse: AuthResponse = {
  token: 'recify-jwt',
  user,
};

function installGisMock(credential = 'gis-id-token') {
  let callback: ((response: GoogleCredentialResponse) => void) | undefined;
  const google: GoogleIdentityServices = {
    accounts: {
      id: {
        initialize: vi.fn((config) => {
          callback = config.callback;
        }),
        renderButton: vi.fn((parent) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Continuar con Google';
          button.addEventListener('click', () => {
            callback?.({ credential });
          });
          parent.appendChild(button);
        }),
        prompt: vi.fn(),
        cancel: vi.fn(),
        disableAutoSelect: vi.fn(),
      },
    },
  };
  window.google = google;
  return google;
}

function wrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

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

async function waitForGoogleButton() {
  const container = await screen.findByTestId('google-signin-button');
  return waitFor(() => within(container).getByRole('button', { name: 'Continuar con Google' }));
}

function storageSnapshot() {
  const values: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key) values.push(`${key}=${localStorage.getItem(key) ?? ''}`);
  }
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key) values.push(`session:${key}=${sessionStorage.getItem(key) ?? ''}`);
  }
  return values.join('\n');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  markAuthSessionActive();
  vi.clearAllMocks();
  identityMocks.getGoogleClientId.mockReturnValue('test-google-client-id.apps.googleusercontent.com');
  identityMocks.loadGoogleIdentityScript.mockResolvedValue(undefined);
  installGisMock();
  vi.spyOn(toast, 'error').mockImplementation(() => 'toast');
  vi.spyOn(toast, 'info').mockImplementation(() => 'toast');
});

afterEach(() => {
  delete window.google;
  cleanup();
});

describe('Google login UI', () => {
  it('shows the Google button on the login tab', async () => {
    renderAuthPage();
    expect(await waitForGoogleButton()).toBeInTheDocument();
  });

  it('does not offer Google signup on the register tab', async () => {
    renderAuthPage();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(screen.queryByTestId('google-signin-button')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('María Rodríguez')).toBeInTheDocument();
  });

  it('sends the GIS credential as idToken and persists the Recify session', async () => {
    vi.mocked(googleLoginRequest).mockResolvedValueOnce(successResponse);
    renderAuthPage();
    fireEvent.click(await waitForGoogleButton());

    await waitFor(() => {
      expect(googleLoginRequest).toHaveBeenCalledWith({ idToken: 'gis-id-token' });
    });
    expect(googleLoginRequest).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(googleLoginRequest).mock.calls[0][0];
    expect(payload).toEqual({ idToken: 'gis-id-token' });
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('companies');
    expect(payload).not.toHaveProperty('googleId');

    await waitFor(() => expect(getStoredToken()).toBe('recify-jwt'));
    expect(getStoredUser()).toEqual(user);
    expect(getStoredCompanyId()).toBe('company-a');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.token)).toBe('recify-jwt');
    expect(storageSnapshot()).not.toContain('gis-id-token');
    expect(routerMocks.navigate).toHaveBeenCalledWith('/app/upload', { replace: true });
  });

  it('keeps a Recify user without companies on /auth after Google login', async () => {
    vi.mocked(googleLoginRequest).mockResolvedValueOnce({
      token: 'recify-jwt',
      user: { ...user, companies: [] },
    });
    renderAuthPage();
    fireEvent.click(await waitForGoogleButton());

    await waitFor(() => expect(getStoredToken()).toBe('recify-jwt'));
    expect(getStoredCompanyId()).toBeNull();
    expect(toast.info).toHaveBeenCalledWith(
      'Tu cuenta aún no tiene una empresa asignada. Contacta al administrador.',
    );
    expect(routerMocks.navigate).not.toHaveBeenCalled();
    expect(getFormSubmitButton('Iniciar sesión')).toBeInTheDocument();
    expect(storageSnapshot()).not.toContain('gis-id-token');
  });

  it('shows backend errors without storing the Google credential', async () => {
    vi.mocked(googleLoginRequest).mockRejectedValueOnce(
      new ApiRequestError('Invalid credentials', 401),
    );
    renderAuthPage();
    fireEvent.click(await waitForGoogleButton());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid credentials');
    });
    expect(getStoredToken()).toBeNull();
    expect(storageSnapshot()).not.toContain('gis-id-token');
    expect(getFormSubmitButton('Iniciar sesión')).toBeInTheDocument();
  });

  it('keeps the login form usable if the user cancels the Google prompt', async () => {
    renderAuthPage();
    await waitForGoogleButton();

    expect(googleLoginRequest).not.toHaveBeenCalled();
    expect(getStoredToken()).toBeNull();
    expect(getFormSubmitButton('Iniciar sesión')).toBeEnabled();
    expect(screen.getByPlaceholderText('maria@miempresa.com')).toBeInTheDocument();
  });

  it('does not break email login when GIS fails to load', async () => {
    identityMocks.loadGoogleIdentityScript.mockRejectedValueOnce(new Error('blocked'));
    delete window.google;
    vi.mocked(loginRequest).mockResolvedValueOnce(successResponse);

    renderAuthPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No se pudo cargar el inicio de sesión con Google.');
    });

    fireEvent.change(screen.getByPlaceholderText('maria@miempresa.com'), {
      target: { value: 'google@recify.test' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getFormSubmitButton('Iniciar sesión')!);

    await waitFor(() => {
      expect(loginRequest).toHaveBeenCalledWith({
        email: 'google@recify.test',
        password: 'password123',
      });
    });
    await waitFor(() => expect(getStoredToken()).toBe('recify-jwt'));
  });
});

describe('useAuth googleLogin', () => {
  it('reuses setAuthSession like password login', async () => {
    vi.mocked(googleLoginRequest).mockResolvedValueOnce(successResponse);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapperWithClient() });

    await act(async () => {
      await result.current.googleLogin.mutateAsync({ idToken: 'gis-id-token' });
    });

    expect(getStoredToken()).toBe('recify-jwt');
    expect(getStoredUser()).toEqual(user);
    expect(getStoredCompanyId()).toBe('company-a');
    expect(storageSnapshot()).not.toContain('gis-id-token');
  });
});

describe('gisButtonWidthPx', () => {
  it('caps official GIS buttons at 400px and floors invalid widths to 200px', async () => {
    const { gisButtonWidthPx } = await import('@/lib/google-identity');
    expect(gisButtonWidthPx(448)).toBe(400);
    expect(gisButtonWidthPx(360)).toBe(360);
    expect(gisButtonWidthPx(0)).toBe(200);
  });
});
