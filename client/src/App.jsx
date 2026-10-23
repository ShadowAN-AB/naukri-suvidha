import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ROLES, HOME_FOR_ROLE } from '@nexus/shared';

import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';

import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import StudentDashboard from './pages/student/Dashboard.jsx';
import RecruiterDashboard from './pages/recruiter/Dashboard.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import JobsRouter from './pages/JobsRouter.jsx';
import NewJob from './pages/recruiter/NewJob.jsx';
import Approvals from './pages/admin/Approvals.jsx';
import Profile from './pages/Profile.jsx';
import StudentResume from './pages/student/Resume.jsx';
import StudentApplications from './pages/student/Applications.jsx';
import Applicants from './pages/recruiter/Applicants.jsx';
// Recharts is large and only the placement office ever loads it, so the
// analytics page is split out of the bundle every student downloads.
const Analytics = lazy(() => import('./pages/admin/Analytics.jsx'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'));

const Loading = () => <p className="text-sm text-muted">Loading…</p>;
import SystemStatus from './pages/SystemStatus.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';

/** Signed-in users go straight to their dashboard; everyone else gets the front door. */
function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>;
  if (user) return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/login'} replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/status" element={<SystemStatus />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard/student"
          element={
            <ProtectedRoute roles={[ROLES.STUDENT]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/recruiter"
          element={
            <ProtectedRoute roles={[ROLES.RECRUITER]}>
              <RecruiterDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/jobs"
          element={
            <ProtectedRoute roles={[ROLES.STUDENT, ROLES.RECRUITER]}>
              <JobsRouter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/new"
          element={
            <ProtectedRoute roles={[ROLES.RECRUITER]}>
              <NewJob />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/approvals"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Approvals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resume"
          element={
            <ProtectedRoute roles={[ROLES.STUDENT]}>
              <StudentResume />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute roles={[ROLES.STUDENT]}>
              <StudentApplications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants"
          element={
            <ProtectedRoute roles={[ROLES.RECRUITER]}>
              <Applicants />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Suspense fallback={<Loading />}>
                <Analytics />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Suspense fallback={<Loading />}>
                <AuditLog />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
