import { Link } from 'react-router-dom';
import { useMe } from '../../api/auth.js';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';

export default function StudentDashboard() {
  const { data, isPending } = useMe();
  const profile = data?.profile;

  return (
    <>
      <PageHeader
        title={isPending ? 'Welcome' : `Welcome, ${profile?.name ?? 'student'}`}
        description="Your placement dashboard."
        actions={
          <Button as={Link} variant="primary" size="md" to="/jobs">
            Browse open jobs
          </Button>
        }
      />

      {profile && (
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-line bg-card p-5 text-sm sm:grid-cols-4">
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
    </>
  );
}
