import { Link } from 'react-router-dom';
import { useAdminOverview } from '../../api/auth.js';
import StatTile from '../../components/StatTile.jsx';
import PageHeader from '../../components/PageHeader.jsx';

/* A tone each, so the four numbers are told apart at a glance rather than
   read one by one. */
const CARDS = [
  ['students', 'Students', 'accent'],
  ['companies', 'Companies', 'info'],
  ['jobsApproved', 'Jobs live', 'good'],
  ['jobsPending', 'Awaiting approval', 'highlight'],
];

export default function AdminDashboard() {
  const { data, isPending, isError, error } = useAdminOverview();

  return (
    <>
      <PageHeader
        title="Placement office"
        description="An overview of the current cycle."
        actions={
          <Link to="/admin/approvals" className="inline-flex rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-on-solid transition hover:opacity-90">
            Review the approval queue
          </Link>
        }
      />

      {isError && (
        <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error.message}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CARDS.map(([key, label, tone]) => (
          <StatTile
            key={key}
            label={label}
            tone={tone}
            value={isPending ? '—' : (data?.[key] ?? 0)}
          />
        ))}
      </div>
    </>
  );
}
