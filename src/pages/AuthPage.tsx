import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, BarChart3, Shield, Zap, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ApiRequestError } from '@/api/http';
import {
  getStoredCompanyId,
  getStoredToken,
  subscribeAuthChanges,
} from '@/auth/storage';

type AuthMode = 'login' | 'register';

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
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const loading = login.isPending;

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

  const handleGoogleLogin = () => {
    // Google OAuth aún no existe en el backend. Mantenemos el botón visible
    // pero evitamos el flujo simulado con setTimeout.
    toast.info('Iniciar sesión con Google aún no está disponible.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === 'register') {
      // El formulario de registro actual no captura contraseña y el backend
      // requiere además una empresa asociada. Dejamos el botón funcional en UI
      // pero no disparamos un flujo falso: se habilitará cuando exista el
      // endpoint de alta combinada (usuario + empresa). Se mantienen los
      // campos `name`, `businessName`, `businessType` y `phone` para esa fase.
      void name;
      void businessName;
      void businessType;
      void phone;
      toast.info('El registro aún no está disponible. Inicia sesión con una cuenta existente.');
      return;
    }

    if (!email || !password) {
      toast.error('Ingresa tu correo y contraseña.');
      return;
    }

    try {
      const res = await login.mutateAsync({ email, password });
      if (res.user.companies && res.user.companies.length > 0) {
        navigate('/app/upload', { replace: true });
      } else {
        toast.info('Tu cuenta aún no tiene una empresa asignada. Contacta al administrador.');
      }
    } catch (err) {
      toast.error(extractMessage(err, 'No se pudo iniciar sesión.'));
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
                : 'Comienza a organizar tus tickets hoy'}
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

          {/* Google button */}
          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            variant="outline"
            className="w-full h-12 rounded-xl text-sm font-medium border-border hover:bg-secondary transition-all"
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </Button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">o</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">Nombre completo</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="María Rodríguez"
                    className="h-11 rounded-xl bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">Nombre del negocio</Label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Mi Empresa S.A. de C.V."
                    className="h-11 rounded-xl bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">Tipo de negocio</Label>
                  <Select value={businessType} onValueChange={setBusinessType}>
                    <SelectTrigger className="h-11 rounded-xl bg-background border-border">
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="freelancer">Freelancer</SelectItem>
                      <SelectItem value="micro">Microempresa</SelectItem>
                      <SelectItem value="pequena">Pequeña empresa</SelectItem>
                      <SelectItem value="mediana">Mediana empresa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Correo electrónico</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@miempresa.com"
                className="h-11 rounded-xl bg-background border-border"
              />
            </div>
            {mode === 'register' && (
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Teléfono <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="h-11 rounded-xl bg-background border-border"
                />
              </div>
            )}
            {mode === 'login' && (
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 rounded-xl bg-background border-border"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
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
