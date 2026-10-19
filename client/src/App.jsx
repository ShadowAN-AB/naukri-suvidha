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
import SystemStatus from './pages/SystemStatus.jsx';

/** Sends a signed-in user to their own dashboard, and everyone else to login. */
function Landing() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>;
  return <Navigate to={user ? (HOME_FOR_ROLE[user.role] ?? '/login') : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
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
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
