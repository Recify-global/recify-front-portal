import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, BarChart3, Shield, Zap, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiRequestError } from '@/api/http';
import { GoogleSignInButton } from '@/components/recify/GoogleSignInButton';
import {
  getStoredCompanyId,
  getStoredToken,
  subscribeAuthChanges,
} from '@/auth/storage';

type AuthMode = 'login' | 'register';

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

const normalizeRfc = (value: string) => value.toUpperCase().replace(/\s+/g, '');

const features = [
  { icon: Receipt, title: 'Escanea tus tickets', desc: 'Captura tickets físicos y digitales al instante' },
  { icon: BarChart3, title: 'Análisis inteligente', desc: 'Categorización automática de tus gastos' },
  { icon: Shield, title: 'Seguro y confiable', desc: 'Tu información financiera siempre protegida' },
  { icon: Zap, title: 'Rápido y simple', desc: 'Diseñado para emprendedores como tú' },
];

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rfc, setRfc] = useState('');
  const navigate = useNavigate();
  const { login, register, googleLogin } = useAuth();

  const submittingRef = useRef(false);
  const loading = login.isPending || register.isPending || googleLogin.isPending;

  // Si el usuario ya tiene sesión válida (token + companyId) y aterriza en /auth
  // (refresh, back del navegador, deep link), lo mandamos directo a la app.
  // Esto también cubre el caso de que otra pestaña haya hecho login mientras tanto.
  useEffect(() => {
    const maybeRedirect = () => {
      if (getStoredToken() && getStoredCompanyId()) {
        navigate('/app/upload', { replace: true });
      }
    };
    maybeRedirect();
    return subscribeAuthChanges(maybeRedirect);
  }, [navigate]);

  const extractMessage = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError) return err.message || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  const persistAndEnter = (res: { user: { companies?: string[] } }, emptyCompanyMessage: string) => {
    if (res.user.companies && res.user.companies.length > 0) {
      navigate('/app/upload', { replace: true });
      return;
    }
    toast.info(emptyCompanyMessage);
  };

  const handleGoogleCredential = async (idToken: string) => {
    if (loading || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const res = await googleLogin.mutateAsync({ idToken });
      persistAndEnter(
        res,
        'Tu cuenta aún no tiene una empresa asignada. Contacta al administrador.',
      );
    } catch (err) {
      toast.error(extractMessage(err, 'No se pudo iniciar sesión.'));
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submittingRef.current) return;
    submittingRef.current = true;

    try {
      if (mode === 'register') {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        const trimmedCompanyName = companyName.trim();
        const normalizedRfc = normalizeRfc(rfc);

        if (!trimmedName || !trimmedEmail || !password || !trimmedCompanyName || !normalizedRfc) {
          toast.error('Completa tu nombre, correo, contraseña, empresa y RFC.');
          return;
        }

        if (password.length < 8) {
          toast.error('La contraseña debe tener al menos 8 caracteres.');
          return;
        }

        if (normalizedRfc.length < 12 || normalizedRfc.length > 13 || !RFC_REGEX.test(normalizedRfc)) {
          toast.error('Ingresa un RFC válido de 12 o 13 caracteres.');
          return;
        }

        try {
          const res = await register.mutateAsync({
            name: trimmedName,
            email: trimmedEmail,
            password,
            company: {
              name: trimmedCompanyName,
              rfc: normalizedRfc,
            },
          });
          persistAndEnter(
            res,
            'Tu cuenta aún no tiene una empresa asignada. Contacta al administrador.',
          );
        } catch (err) {
          toast.error(extractMessage(err, 'No se pudo crear la cuenta.'));
        }
        return;
      }

      if (!email || !password) {
        toast.error('Ingresa tu correo y contraseña.');
        return;
      }

      try {
        const res = await login.mutateAsync({ email, password });
        persistAndEnter(
          res,
          'Tu cuenta aún no tiene una empresa asignada. Contacta al administrador.',
        );
      } catch (err) {
        toast.error(extractMessage(err, 'No se pudo iniciar sesión.'));
      }
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative z-10">
          <RecifyLogo size="lg" />
          <div className="mt-16 max-w-md">
            <h1 className="text-4xl font-bold text-foreground leading-tight">
              Tus tickets, organizados en segundos
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Convierte comprobantes en información financiera útil. Más claridad para tu negocio, menos trabajo manual.
            </p>
          </div>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-4 mt-12">
          {features.map((f) => (
            <div key={f.title} className="bg-card/60 backdrop-blur-sm rounded-2xl p-4 border border-border/30">
              <f.icon size={20} className="text-primary mb-2" />
              <p className="text-sm font-medium text-foreground">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right auth panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-card">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8">
            <RecifyLogo size="md" />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">
              {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
            </h2>
            <p className="text-muted-foreground mt-1">
              {mode === 'login'
                ? 'Ingresa a tu cuenta para continuar'
                : 'Registra tu empresa y el usuario inicial para administrarla'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-secondary rounded-xl p-1 mb-8">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-card text-foreground shadow-elegant'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-card text-foreground shadow-elegant'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          {mode === 'login' && (
            <>
              <GoogleSignInButton disabled={loading} onCredential={handleGoogleCredential} />

              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">o</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <p className="text-sm font-medium text-foreground">Tu cuenta</p>
                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-sm text-foreground">Nombre completo</Label>
                  <Input
                    id="register-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="María Rodríguez"
                    className="h-11 rounded-xl bg-background border-border"
                    autoComplete="name"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-email" className="text-sm text-foreground">Correo electrónico</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@miempresa.com"
                className="h-11 rounded-xl bg-background border-border"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password" className="text-sm text-foreground">Contraseña</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 rounded-xl bg-background border-border"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>
            {mode === 'register' && (
              <>
                <p className="text-sm font-medium text-foreground pt-2">Datos de tu empresa</p>
                <div className="space-y-2">
                  <Label htmlFor="register-company-name" className="text-sm text-foreground">Nombre de la empresa</Label>
                  <Input
                    id="register-company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Mi Empresa S.A. de C.V."
                    className="h-11 rounded-xl bg-background border-border"
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-rfc" className="text-sm text-foreground">RFC</Label>
                  <Input
                    id="register-rfc"
                    value={rfc}
                    onChange={(e) => setRfc(normalizeRfc(e.target.value))}
                    placeholder="XAXX010101000"
                    className="h-11 rounded-xl bg-background border-border uppercase"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={13}
                  />
                  <p className="text-xs text-muted-foreground">12 o 13 caracteres, como en tu constancia fiscal.</p>
                </div>
              </>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta y empresa'}
            </Button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              <a href="#" className="text-primary hover:underline">¿Olvidaste tu contraseña?</a>
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            Al continuar, aceptas nuestros{' '}
            <a href="#" className="text-primary hover:underline">Términos de servicio</a>
            {' '}y{' '}
            <a href="#" className="text-primary hover:underline">Política de privacidad</a>
          </p>
        </div>
      </div>
    </div>
  );
}
