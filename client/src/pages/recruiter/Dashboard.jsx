import { Link } from 'react-router-dom';
import { useMe } from '../../api/auth.js';
import PageHeader from '../../components/PageHeader.jsx';

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
            <Link to="/jobs/new" className="inline-flex rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-on-solid transition hover:opacity-90">
              Post a job
            </Link>
            <Link to="/jobs" className="inline-flex rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium transition hover:bg-subtle">
              Your postings
            </Link>
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
