import { Routes, Route, Navigate } from 'react-router-dom';
import SystemStatus from './pages/SystemStatus.jsx';

/**
 * Phase 1 serves one page: proof that the client, proxy, server and database
 * are connected. The real shell, with its role-based layouts and protected
 * routes, lands in Phase 2.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SystemStatus />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
