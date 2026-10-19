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

      <PhaseNotice phase={3}>
        Eligible jobs, ranked by how well your profile fits them, with your résumé and
        applications alongside.
      </PhaseNotice>
    </>
  );
}
