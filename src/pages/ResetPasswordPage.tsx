import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/api/http';
import { resetPasswordRequest } from '@/services/auth.service';

type ResetState = 'form' | 'success' | 'invalid' | 'missing';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const tokenRef = useRef(params.get('token')?.trim() ?? '');
  const [state, setState] = useState<ResetState>(tokenRef.current ? 'form' : 'missing');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    window.history.replaceState({}, '', '/auth/reset-password');
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || state !== 'form') return;
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    setPending(true);
    try {
      await resetPasswordRequest({ token: tokenRef.current, password });
      tokenRef.current = '';
      setPassword('');
      setConfirmation('');
      setState('success');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 400) {
        setState('invalid');
        return;
      }
      toast.error('No pudimos guardar la contraseña. Inténtalo más tarde.');
    } finally {
      setPending(false);
    }
  };

  const title = state === 'success'
    ? 'Contraseña actualizada'
    : state === 'invalid'
      ? 'El enlace no es válido'
      : state === 'missing'
        ? 'Falta el enlace de recuperación'
        : 'Elige una contraseña nueva';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <RecifyLogo size="md" />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {state === 'success' && (
            <p className="text-sm leading-6 text-muted-foreground" role="status">
              Tu contraseña se actualizó. Las sesiones anteriores ya no sirven.
            </p>
          )}
          {state === 'invalid' && (
            <p className="text-sm leading-6 text-muted-foreground" role="status">
              El enlace expiró o ya se usó. Solicita otro desde el inicio de sesión.
            </p>
          )}
          {state === 'missing' && (
            <p className="text-sm leading-6 text-muted-foreground" role="status">
              Abre el enlace completo que te enviamos por correo.
            </p>
          )}
        </div>
        {state === 'form' && (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">Contraseña nueva</Label>
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-password-confirm">Confirmar contraseña</Label>
              <Input
                id="reset-password-confirm"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link to="/auth" className="text-primary hover:underline">Volver a iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
