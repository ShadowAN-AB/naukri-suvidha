import { Link } from 'react-router-dom';
import { useAdminOverview } from '../../api/auth.js';
import StatTile from '../../components/StatTile.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';

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
          <Button as={Link} variant="primary" size="md" to="/admin/approvals">
            Review the approval queue
          </Button>
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
