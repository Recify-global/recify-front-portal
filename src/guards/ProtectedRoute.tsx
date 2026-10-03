import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  getStoredCompanyId,
  getStoredToken,
  getStoredUser,
  subscribeAuthChanges,
} from '@/auth/storage';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  redirectTo?: string;
}

function readSnapshot() {
  const user = getStoredUser();
  return {
    token: user ? getStoredToken() : null,
    companyId: user ? getStoredCompanyId() : null,
    user,
  };
}

export default function ProtectedRoute({ children, redirectTo = '/auth' }: ProtectedRouteProps) {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState(readSnapshot);

  // Suscribirnos a cambios de sesión (login, logout, 401 auto-limpiado, otra pestaña)
  // permite que este guard redirija sin necesidad de que el padre re-renderice.
  useEffect(() => {
    return subscribeAuthChanges(() => setSnapshot(readSnapshot()));
  }, []);

  if (!snapshot.token || !snapshot.companyId) {
    return (
      <Navigate
        to={!snapshot.token || !snapshot.user ? redirectTo : '/select-company'}
        replace
        state={{ from: location }}
      />
    );
  }

  return <>{children ?? <Outlet />}</>;
}

export function AuthenticatedRoute({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState(readSnapshot);

  useEffect(() => subscribeAuthChanges(() => setSnapshot(readSnapshot())), []);

  if (!snapshot.token || !snapshot.user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <>{children ?? <Outlet />}</>;
}
