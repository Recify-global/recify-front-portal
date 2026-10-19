import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyName } from '@/components/recify/CompanyName';
import { CompanySelector } from '@/components/recify/CompanySelector';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/recify/AppSidebar';

const session = vi.hoisted(() => ({
  companyId: 'company-a',
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    companyId: session.companyId,
    setActiveCompany: vi.fn(),
    activeMembership: { role: 'accountant' },
    logout: vi.fn(),
    user: {
      name: 'Ana López',
      email: 'ana@empresa.test',
      emailVerified: true,
      memberships: [
        {
          membershipId: 'membership-a',
          companyId: 'company-a',
          companyName: 'Café Ñandú S.A.',
          companyStatus: 'active',
          companyTimezone: 'America/Mexico_City',
          role: 'accountant',
          status: 'active',
        },
        {
          membershipId: 'membership-b',
          companyId: 'company-b',
          companyName: 'Panadería Oaxaca',
          companyStatus: 'active',
          companyTimezone: 'America/Mexico_City',
          role: 'viewer',
          status: 'active',
        },
      ],
    },
  }),
}));

const renderSelector = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanySelector />
    </QueryClientProvider>,
  );
};

afterEach(() => {
  session.companyId = 'company-a';
  cleanup();
});

describe('company names stay untranslated', () => {
  it('preserves accents and spaces on the name element', () => {
    render(<CompanyName>Café Ñandú S.A.</CompanyName>);
    const name = screen.getByText('Café Ñandú S.A.');
    expect(name).toHaveAttribute('translate', 'no');
    expect(name).toHaveClass('notranslate');
    expect(name).toHaveTextContent('Café Ñandú S.A.');
  });

  it('protects the active company and the other option without blocking the label', () => {
    const view = renderSelector();
    const active = screen.getByText('Café Ñandú S.A.');
    expect(active).toHaveAttribute('translate', 'no');
    expect(active).toHaveClass('notranslate');
    expect(screen.getByText('Compañía')).not.toHaveAttribute('translate', 'no');

    session.companyId = 'company-b';
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CompanySelector />
      </QueryClientProvider>,
    );
    const next = screen.getByText('Panadería Oaxaca');
    expect(next).toHaveAttribute('translate', 'no');
    expect(next).toHaveClass('notranslate');
    expect(screen.queryByText('Café Ñandú S.A.')).not.toBeInTheDocument();
  });

  it('leaves sidebar navigation labels available for translation', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    for (const label of ['Subir tickets y facturas', 'Mi equipo', 'Configuración']) {
      expect(screen.getByText(label)).not.toHaveAttribute('translate', 'no');
      expect(screen.getByText(label)).not.toHaveClass('notranslate');
    }
    expect(screen.getByText('Recify')).toHaveAttribute('translate', 'no');
    expect(screen.getByText('Café Ñandú S.A.')).toHaveAttribute('translate', 'no');
  });
});
