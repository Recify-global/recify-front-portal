import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/guards/ProtectedRoute';
import { clearAuthSession, setAuthSession } from '@/auth/storage';
import type { AuthUser } from '@/types/auth';

const user: AuthUser = {
  _id: 'user-a',
  name: 'Usuario A',
  email: 'a@recify.test',
  role: 'admin',
  companies: ['company-a'],
  status: 'active',
};

function LocationMarker() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function TestRoutes({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <LocationMarker />
      <Routes>
        <Route path="/auth" element={<div>Pantalla de acceso</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/app/history" element={<div>Datos sensibles A</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('ProtectedRoute after session cleanup', () => {
  it('unmounts protected content as soon as auth storage is cleared', async () => {
    setAuthSession({ token: 'token-a', user });
    render(<TestRoutes initialEntries={['/app/history']} />);
    expect(screen.getByText('Datos sensibles A')).toBeInTheDocument();

    act(() => {
      clearAuthSession();
    });

    expect(await screen.findByText('Pantalla de acceso')).toBeInTheDocument();
    expect(screen.queryByText('Datos sensibles A')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/auth');
  });

  it('redirects a protected Back/deep-link URL without rendering its content', async () => {
    render(<TestRoutes initialEntries={['/app/history']} />);

    expect(await screen.findByText('Pantalla de acceso')).toBeInTheDocument();
    expect(screen.queryByText('Datos sensibles A')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/auth');
  });
});
