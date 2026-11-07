import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/api/http';
import { forgotPasswordRequest } from '@/services/auth.service';

const GENERIC_MESSAGE = 'Si existe una cuenta asociada a este correo, recibirás instrucciones para recuperar tu contraseña.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || sent) return;
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Escribe el correo de tu cuenta.');
      return;
    }
    setPending(true);
    try {
      await forgotPasswordRequest(trimmed);
      setSent(true);
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      if (status === 429) {
        toast.error('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
      } else {
        toast.error('No pudimos enviar el correo. Inténtalo más tarde.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <RecifyLogo size="md" />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Recupera tu contraseña</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Te enviaremos un enlace para elegir una contraseña nueva.
          </p>
        </div>
        {sent ? (
          <p className="text-sm leading-6 text-muted-foreground" role="status">{GENERIC_MESSAGE}</p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Correo electrónico</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? 'Enviando…' : 'Enviar instrucciones'}
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
