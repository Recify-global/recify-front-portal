import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RecifyLogo } from '@/components/recify/RecifyLogo';
import { Button } from '@/components/ui/button';
import { confirmEmailVerification, getMeRequest } from '@/services/auth.service';
import { getClientSession, updateStoredUser } from '@/auth/storage';

type VerifyState = 'loading' | 'success' | 'invalid' | 'missing';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const tokenRef = useRef(params.get('token')?.trim() ?? '');
  const [state, setState] = useState<VerifyState>('loading');

  useEffect(() => {
    const token = tokenRef.current;
    window.history.replaceState({}, '', '/auth/verify-email');
    if (!token) {
      setState('missing');
      return undefined;
    }

    let cancelled = false;
    confirmEmailVerification(token)
      .then(async () => {
        if (getClientSession().status === 'authenticated') {
          try {
            const profile = await getMeRequest();
            updateStoredUser(profile.user);
          } catch {
            // The mailbox is verified even when this browser has no session.
          }
        }
        if (!cancelled) setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const title = state === 'success'
    ? 'Correo verificado'
    : state === 'invalid'
      ? 'El enlace no es válido'
      : state === 'missing'
        ? 'Falta el enlace de verificación'
        : 'Confirmando tu correo…';

  const description = state === 'success'
    ? 'Ya puedes usar esta cuenta para unirte a una empresa que te invite.'
    : state === 'invalid'
      ? 'El enlace expiró o ya se usó. Pide otro desde tu cuenta.'
      : state === 'missing'
        ? 'Abre el enlace completo que te enviamos por correo.'
        : 'Esto puede tardar unos segundos.';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <RecifyLogo size="md" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground" role="status">{description}</p>
        </div>
        {state !== 'loading' && (
          <Button asChild className="h-11 w-full">
            <Link to="/auth">Ir a iniciar sesión</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
