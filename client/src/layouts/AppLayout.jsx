import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  ScrollText,
  SendHorizontal,
  User,
  Users,
} from 'lucide-react';
import { ROLES } from '@nexus/shared';

import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const NAV = {
  [ROLES.STUDENT]: [
    ['/dashboard/student', 'Dashboard', LayoutDashboard],
    ['/jobs', 'Jobs', Briefcase],
    ['/applications', 'Applications', SendHorizontal],
    ['/resume', 'Résumé', FileText],
    ['/profile', 'Profile', User],
  ],
  [ROLES.RECRUITER]: [
    ['/dashboard/recruiter', 'Dashboard', LayoutDashboard],
    ['/jobs', 'Postings', Briefcase],
    ['/applicants', 'Applicants', Users],
    ['/profile', 'Profile', User],
  ],
  [ROLES.ADMIN]: [
    ['/dashboard/admin', 'Dashboard', LayoutDashboard],
    ['/admin/approvals', 'Approvals', ClipboardCheck],
    ['/admin/analytics', 'Analytics', BarChart3],
    ['/admin/audit', 'Audit', ScrollText],
  ],
};

const ROLE_LABEL = {
  [ROLES.STUDENT]: 'Student',
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.ADMIN]: 'Placement office',
};

const Brand = () => (
  <span className="flex items-center gap-2 font-semibold tracking-tight">
    <span aria-hidden className="size-2.5 rounded-full bg-highlight-solid" />
    Nexus
  </span>
);

/**
 * The sidebar is the desktop navigation; below `lg` it is replaced by the tab
 * bar rather than folded into a hamburger, which would hide every destination
 * behind a tap on the one screen size where people browse most.
 */
function Sidebar({ items, user, onSignOut }) {
  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-line lg:bg-card">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Brand />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 px-3">
        {items.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                isActive
                  ? 'bg-accent-soft font-medium text-accent-strong'
                  : 'text-muted hover:bg-subtle hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <p className="truncate px-3 text-sm font-medium">{user.email}</p>
        <p className="px-3 text-xs text-muted">{ROLE_LABEL[user.role]}</p>
        <button
          onClick={onSignOut}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink"
        >
          <LogOut size={16} strokeWidth={1.5} aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Thumb-reachable navigation, and the only nav below `lg`. */
function MobileTabBar({ items }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors duration-150 ${
              isActive ? 'text-accent-strong' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV[user.role] ?? [];

  const onSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <Sidebar items={items} user={user} onSignOut={onSignOut} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-card/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <span className="lg:hidden">
              <Brand />
            </span>

            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <ThemeToggle />
              <button
                onClick={onSignOut}
                aria-label="Sign out"
                className="inline-grid size-9 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink lg:hidden"
              >
                <LogOut size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </header>

        {/* The bottom padding clears the tab bar, which floats over the page. */}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 lg:pb-14">
          <Outlet />
        </main>
      </div>

      <MobileTabBar items={items} />
    </div>
  );
}
