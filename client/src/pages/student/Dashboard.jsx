import { Link } from 'react-router-dom';
import { useMe } from '../../api/auth.js';
import PhaseNotice from '../../components/PhaseNotice.jsx';

export default function StudentDashboard() {
  const { data, isPending } = useMe();
  const profile = data?.profile;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isPending ? 'Welcome' : `Welcome, ${profile?.name ?? 'student'}`}
      </h1>
      <p className="mt-1 text-muted">Your placement dashboard.</p>

      {profile && (
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-line bg-white p-5 text-sm sm:grid-cols-4">
          {[
            ['Roll number', profile.rollNo],
            ['Branch', profile.branch],
            ['Batch', profile.batchYear],
            ['CGPA', profile.cgpa],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="mt-0.5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6">
        <Link
          to="/jobs"
          className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Browse open jobs
        </Link>
      </div>

      <PhaseNotice phase={5}>
        Your résumé parsed into a profile automatically, and every job ranked by how well
        you fit it.
      </PhaseNotice>
    </>
  );
}
