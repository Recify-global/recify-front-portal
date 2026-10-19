import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/api/http';
import { useAuth } from '@/hooks/use-auth';
import { requestEmailVerification } from '@/services/auth.service';

const verificationError = (err: unknown) => {
  if (err instanceof ApiRequestError && err.status === 429) {
    return 'Ya pediste varios correos. Espera un momento e inténtalo de nuevo.';
  }
  if (err instanceof ApiRequestError && err.status === 503) {
    return 'No pudimos enviar el correo de verificación. Inténtalo más tarde.';
  }
  return 'No pudimos enviar el correo de verificación.';
};

export function EmailVerificationNotice() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerified === true) return null;

  const resend = async () => {
    setSending(true);
    try {
      await requestEmailVerification();
      toast.success('Si el envío está disponible, recibirás un enlace para confirmar tu correo.');
    } catch (err) {
      toast.error(verificationError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-border/60 bg-amber-500/10 px-4 py-3 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          Tu correo todavía no está verificado. Hasta confirmarlo no podrás unirte a otra empresa.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          disabled={sending}
          onClick={() => void resend()}
        >
          {sending ? 'Enviando…' : 'Reenviar correo'}
        </Button>
      </div>
    </div>
  );
}
