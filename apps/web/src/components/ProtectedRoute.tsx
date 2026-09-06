import { Navigate } from 'react-router-dom';
import type { UserRoleCode } from '@technical-platform/shared';
import { useAuth } from '../context/AuthContext';

/**
 * Route protection here is a UX nicety only — the actual authorization
 * happens on the server (RolesGuard, deny-by-default). This just avoids
 * flashing an admin page at a student before their API calls start failing.
 */
export function ProtectedRoute({ allow, children }: { allow: UserRoleCode[]; children: React.ReactNode }) {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <div className="page-centered">Loading…</div>;
  }
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  if (!allow.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
