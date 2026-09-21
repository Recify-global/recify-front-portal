import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Eye, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import type { CompanyMembership } from '@/types/auth';

const roleLabel = (membership: CompanyMembership) =>
  membership.role;

export default function SelectCompanyPage() {
  const navigate = useNavigate();
  const { user, setActiveCompany, logout } = useAuth();
  const memberships = useMemo(() => user?.memberships ?? [], [user?.memberships]);

  useEffect(() => {
    if (memberships.length !== 1 || memberships[0].companyStatus !== 'active') return;
    setActiveCompany(memberships[0].companyId);
    navigate('/app/upload', { replace: true });
  }, [memberships, navigate, setActiveCompany]);

  const enter = (companyId: string) => {
    setActiveCompany(companyId);
    navigate('/app/upload', { replace: true });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_40%),radial-gradient(circle_at_bottom_right,hsl(var(--accent)/0.18),transparent_42%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <RecifyLogo size="md" />
          <Button variant="ghost" onClick={() => void logout()} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </Button>
        </header>

        <section className="flex flex-1 items-center justify-center py-12">
          <div className="w-full">
            <div className="mx-auto mb-9 max-w-xl text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {memberships.length === 0
                  ? 'Tu cuenta aún no tiene empresa'
                  : '¿A qué empresa quieres entrar?'}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                {memberships.length === 0
                  ? 'Pide a un administrador que te agregue a una empresa para comenzar.'
                  : 'Tu rol y permisos se ajustarán a la empresa que selecciones.'}
              </p>
            </div>

            {memberships.length > 0 ? (
              <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
                {memberships.map((membership) => {
                  const disabled = membership.companyStatus !== 'active';
                  const RoleIcon = membership.role === 'accountant' ? ShieldCheck : Eye;
                  return (
                    <button
                      key={membership.membershipId}
                      type="button"
                      disabled={disabled}
                      onClick={() => enter(membership.companyId)}
                      className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            disabled
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {disabled ? 'Suspendida' : 'Activa'}
                        </span>
                      </div>
                      <h2 className="mt-5 truncate text-lg font-semibold text-foreground">
                        {membership.companyName}
                      </h2>
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <RoleIcon className="h-4 w-4" />
                        <span>{roleLabel(membership)}</span>
                      </div>
                      <div className="mt-6 flex items-center justify-between text-sm font-medium text-primary">
                        <span>{disabled ? 'No disponible' : 'Entrar'}</span>
                        {!disabled && (
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border bg-card/70 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Cuando te asignen una empresa, aparecerá aquí automáticamente al volver a iniciar sesión.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
