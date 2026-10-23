import { Navigate, useLocation } from 'react-router-dom';
import { HOME_FOR_ROLE } from '@naukri-suvidha/shared';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Guards a branch of the router. This is a convenience for the person using
 * the app, not a security boundary: every one of these rules is enforced again
 * on the server, which is the only place that counts.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/'} replace />;
  }

  return children;
}
