import { ROLES } from '@nexus/shared';
import { useAuth } from '../context/AuthContext.jsx';
import StudentJobs from './student/Jobs.jsx';
import RecruiterJobs from './recruiter/Jobs.jsx';

/** /jobs means something different depending on who is asking. */
export default function JobsRouter() {
  const { user } = useAuth();
  return user.role === ROLES.RECRUITER ? <RecruiterJobs /> : <StudentJobs />;
}
