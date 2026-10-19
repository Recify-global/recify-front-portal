import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Building2, Eye, LogOut, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompanyName } from '@/components/recify/CompanyName';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import type { CompanyMembership } from '@/types/auth';
import { EmailVerificationNotice } from '@/components/recify/EmailVerificationNotice';
import { ApiRequestError } from '@/api/http';
import { createFirstCompanyRequest, getMeRequest } from '@/services/auth.service';
import { updateStoredUser } from '@/auth/storage';

const roleLabel = (membership: CompanyMembership) =>
  membership.role;

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const normalizeRfc = (value: string) => value.toUpperCase().replace(/\s+/g, '');

export default function SelectCompanyPage() {
  const navigate = useNavigate();
  const { user, setActiveCompany, logout } = useAuth();
  const memberships = useMemo(() => user?.memberships ?? [], [user?.memberships]);
  const [companyName, setCompanyName] = useState('');
  const [rfc, setRfc] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);

  useEffect(() => {
    if (memberships.length !== 1 || memberships[0].companyStatus !== 'active') return;
    setActiveCompany(memberships[0].companyId);
    navigate('/app/upload', { replace: true });
  }, [memberships, navigate, setActiveCompany]);

  const enter = (companyId: string) => {
    setActiveCompany(companyId);
    navigate('/app/upload', { replace: true });
  };

  const handleCreateCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingCompany) return;
    const trimmedName = companyName.trim();
    const normalizedRfc = normalizeRfc(rfc);
    if (!trimmedName || !normalizedRfc) {
      toast.error('Escribe el nombre de la empresa y su RFC.');
      return;
    }
    if (normalizedRfc.length < 12 || normalizedRfc.length > 13 || !RFC_REGEX.test(normalizedRfc)) {
      toast.error('Ingresa un RFC válido de 12 o 13 caracteres.');
      return;
    }

    setCreatingCompany(true);
    try {
      const created = await createFirstCompanyRequest({ name: trimmedName, rfc: normalizedRfc });
      updateStoredUser(created.user);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        try {
          const profile = await getMeRequest();
          updateStoredUser(profile.user);
          if (profile.user.memberships.length > 0) return;
        } catch {
          // The form stays available when the profile cannot be refreshed.
        }
      }
      const message = err instanceof ApiRequestError && /RFC/i.test(err.message)
        ? 'Ese RFC ya está registrado.'
        : 'No se pudo crear la empresa.';
      toast.error(message);
    } finally {
      setCreatingCompany(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_40%),radial-gradient(circle_at_bottom_right,hsl(var(--accent)/0.18),transparent_42%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <EmailVerificationNotice />
        <header className="mt-4 flex items-center justify-between">
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
                  ? 'Configura tu empresa con su nombre y RFC para empezar. Si ya tienes acceso a otra, aparecerá aquí cuando esté disponible.'
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
                      <h2 className="mt-5 text-lg font-semibold text-foreground">
                        <CompanyName className="block truncate">{membership.companyName}</CompanyName>
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
              <form
                onSubmit={(event) => void handleCreateCompany(event)}
                className="mx-auto max-w-md space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm"
              >
                <div className="space-y-2">
                  <Label htmlFor="onboarding-company-name">Nombre de la empresa</Label>
                  <Input
                    id="onboarding-company-name"
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="Mi Empresa S.A. de C.V."
                    autoComplete="organization"
                    translate="no"
                    className="notranslate h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-rfc">RFC</Label>
                  <Input
                    id="onboarding-rfc"
                    value={rfc}
                    onChange={(event) => setRfc(normalizeRfc(event.target.value))}
                    placeholder="XAXX010101000"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={13}
                    className="h-11 rounded-xl uppercase"
                  />
                  <p className="text-xs text-muted-foreground">12 o 13 caracteres, como en tu constancia fiscal.</p>
                </div>
                <Button type="submit" className="w-full" disabled={creatingCompany}>
                  {creatingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {creatingCompany ? 'Configurando empresa…' : 'Crear empresa'}
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
