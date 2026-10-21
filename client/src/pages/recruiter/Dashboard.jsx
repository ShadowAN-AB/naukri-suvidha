import { Link } from 'react-router-dom';
import { useMe } from '../../api/auth.js';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';

export default function RecruiterDashboard() {
  const { data, isPending } = useMe();
  const company = data?.profile;

  return (
    <>
      <PageHeader
        title={isPending ? 'Welcome' : (company?.name ?? 'Your company')}
        description="Recruiter dashboard."
        actions={
          <>
            <Button as={Link} variant="primary" size="md" to="/jobs/new">
              Post a job
            </Button>
            <Button as={Link} variant="secondary" size="md" to="/jobs">
              Your postings
            </Button>
          </>
        }
      />

      {company && (
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-line bg-card p-5 text-sm sm:grid-cols-3">
          {[
            ['Industry', company.industry || '—'],
            ['Website', company.website || '—'],
            ['Verified', company.verified ? 'Yes' : 'Awaiting the placement office'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd className="mt-0.5 truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
