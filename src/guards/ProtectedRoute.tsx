import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { performLogout, resumeFailedLogout, useClientSession } from '@/hooks/use-auth';
import { probeSession } from '@/auth/session-probe';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  redirectTo?: string;
}

function SessionStatus({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p role="status" className="text-sm text-muted-foreground">{title}</p>
      {action ? (
        <button type="button" className="text-sm font-medium text-primary" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export default function ProtectedRoute({ children, redirectTo = '/auth' }: ProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useClientSession();

  if (session.status === 'loading') {
    return <SessionStatus title="Comprobando sesión…" />;
  }

  if (session.status === 'offline') {
    return (
      <SessionStatus
        title="No se pudo comprobar la sesión. Revisa tu conexión."
        action={{ label: 'Reintentar', onClick: () => void probeSession({ force: true }) }}
      />
    );
  }

  if (session.status === 'forbidden') {
    return <SessionStatus title="No tienes permiso para usar esta sesión." />;
  }

  if (session.status === 'signing-out') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="status" className="text-sm text-muted-foreground">Cerrando sesión…</p>
        {session.logoutError ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">{session.logoutError}</p>
            <button type="button" className="text-sm font-medium text-primary" onClick={() => void performLogout(navigate)}>
              Reintentar
            </button>
            <button type="button" className="text-sm text-muted-foreground" onClick={() => void resumeFailedLogout()}>
              Volver
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (session.status !== 'authenticated' || !session.user || !session.companyId) {
    return (
      <Navigate
        to={session.status === 'authenticated' && session.user ? '/select-company' : redirectTo}
        replace
        state={{ from: location }}
      />
    );
  }

  return <>{children ?? <Outlet />}</>;
}

export function AuthenticatedRoute({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const session = useClientSession();

  if (session.status === 'loading' || session.status === 'signing-out') {
    return <SessionStatus title={session.status === 'loading' ? 'Comprobando sesión…' : 'Cerrando sesión…'} />;
  }

  if (session.status === 'offline') {
    return (
      <SessionStatus
        title="No se pudo comprobar la sesión. Revisa tu conexión."
        action={{ label: 'Reintentar', onClick: () => void probeSession({ force: true }) }}
      />
    );
  }

  if (session.status !== 'authenticated' || !session.user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <>{children ?? <Outlet />}</>;
}
