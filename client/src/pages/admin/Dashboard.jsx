import { useAdminOverview } from '../../api/auth.js';
import PhaseNotice from '../../components/PhaseNotice.jsx';

const CARDS = [
  ['students', 'Students'],
  ['companies', 'Companies'],
  ['jobsApproved', 'Jobs live'],
  ['jobsPending', 'Awaiting approval'],
];

export default function AdminDashboard() {
  const { data, isPending, isError, error } = useAdminOverview();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Placement office</h1>
      <p className="mt-1 text-muted">An overview of the current cycle.</p>

      {isError && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CARDS.map(([key, label]) => (
          <div key={key} className="rounded-xl border border-line bg-white p-5">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {isPending ? '—' : (data?.[key] ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <PhaseNotice phase={3}>
        The job approval queue, where a posting becomes visible to students only once it is
        approved here.
      </PhaseNotice>
    </>
  );
}
