import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  getStoredCompanyId,
  getStoredToken,
  subscribeAuthChanges,
} from '@/auth/storage';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  redirectTo?: string;
}

function readSnapshot() {
  return {
    token: getStoredToken(),
    companyId: getStoredCompanyId(),
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
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return <>{children ?? <Outlet />}</>;
}
