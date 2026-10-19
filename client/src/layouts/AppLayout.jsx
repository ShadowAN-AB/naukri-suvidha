import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLES } from '@nexus/shared';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = {
  [ROLES.STUDENT]: [
    ['/dashboard/student', 'Dashboard'],
    ['/jobs', 'Jobs'],
    ['/profile', 'Profile'],
  ],
  [ROLES.RECRUITER]: [
    ['/dashboard/recruiter', 'Dashboard'],
    ['/jobs', 'Postings'],
    ['/profile', 'Profile'],
  ],
  [ROLES.ADMIN]: [
    ['/dashboard/admin', 'Dashboard'],
    ['/admin/approvals', 'Approvals'],
  ],
};

const ROLE_LABEL = {
  [ROLES.STUDENT]: 'Student',
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.ADMIN]: 'Placement office',
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <span className="font-semibold tracking-tight">Nexus</span>

          <nav className="flex gap-1">
            {(NAV[user.role] ?? []).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:text-ink'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">
              {user.email} · {ROLE_LABEL[user.role]}
            </span>
            <button
              onClick={onSignOut}
              className="rounded-lg border border-line px-3 py-1.5 font-medium transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
