import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  getGoogleClientId,
  gisButtonWidthPx,
  loadGoogleIdentityScript,
} from '@/lib/google-identity';
import type { GoogleCredentialResponse } from '@/types/google-gis';

interface GoogleSignInButtonProps {
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
}

export function GoogleSignInButton({ disabled = false, onCredential }: GoogleSignInButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  onCredentialRef.current = onCredential;

  useEffect(() => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;

    const handleCredential = (response: GoogleCredentialResponse) => {
      const idToken = typeof response.credential === 'string' ? response.credential.trim() : '';
      if (!idToken) {
        toast.error('No se pudo iniciar sesión con Google.');
        return;
      }
      void onCredentialRef.current(idToken);
    };

    const paintButton = () => {
      if (cancelled) return;
      const host = hostRef.current;
      const container = containerRef.current;
      const googleId = window.google?.accounts?.id;
      if (!host || !container || !googleId) {
        setStatus('unavailable');
        toast.error('No se pudo cargar el inicio de sesión con Google.');
        return;
      }

      if (!initialized) {
        googleId.initialize({
          client_id: clientId,
          callback: handleCredential,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initialized = true;
      }

      container.replaceChildren();
      googleId.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: gisButtonWidthPx(host.getBoundingClientRect().width),
        logo_alignment: 'left',
      });
      setStatus('ready');
    };

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled) return;
        paintButton();
        const host = hostRef.current;
        if (!host || typeof ResizeObserver === 'undefined') return;
        let lastWidth = Math.floor(host.getBoundingClientRect().width);
        resizeObserver = new ResizeObserver(() => {
          const nextWidth = Math.floor(host.getBoundingClientRect().width);
          if (nextWidth === lastWidth) return;
          lastWidth = nextWidth;
          paintButton();
        });
        resizeObserver.observe(host);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('unavailable');
        toast.error('No se pudo cargar el inicio de sesión con Google.');
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, []);

  if (status === 'unavailable') {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="w-full h-12 rounded-xl text-sm font-medium border-border"
      >
        Continuar con Google
      </Button>
    );
  }

  return (
    <div ref={hostRef} className="relative flex w-full min-h-12 max-w-full justify-center">
      <div
        ref={containerRef}
        data-testid="google-signin-button"
        className={`flex min-h-12 max-w-full justify-center [&>div]:mx-auto ${
          status === 'ready' ? '' : 'invisible absolute inset-0 w-full'
        }`}
      />
      {status !== 'ready' && (
        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full h-12 rounded-xl text-sm font-medium border-border"
        >
          Continuar con Google
        </Button>
      )}
      {disabled && status === 'ready' ? (
        <div className="absolute inset-0 z-10 cursor-not-allowed rounded-xl bg-card/40" aria-hidden="true" />
      ) : null}
    </div>
  );
}
