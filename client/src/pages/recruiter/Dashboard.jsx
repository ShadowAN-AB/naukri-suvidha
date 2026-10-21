import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { useMe } from '../../api/auth.js';
import { useJobs } from '../../api/jobs.js';
import { useApplications } from '../../api/applications.js';
import PageHeader from '../../components/PageHeader.jsx';
import InterviewList from '../../components/InterviewList.jsx';
import StatTile from '../../components/StatTile.jsx';
import { StatusPill } from '../../components/ApplicationStatus.jsx';
import { FitBadge } from '../../components/FitScore.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { formatDate } from '../../lib/format.js';

export default function RecruiterDashboard() {
  const { data, isPending } = useMe();
  const company = data?.profile;

  // The jobs schema caps limit at 50; asking for more is a 400, not a cap.
  const { data: jobsData } = useJobs({ limit: 50 });
  const { data: appsData } = useApplications({ limit: 100 });

  const jobs = jobsData?.items ?? [];
  const counts = jobs.reduce((acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }), {});
  const apps = appsData?.items ?? [];
  const recent = apps.slice(0, 4);

  return (
    <>
      <PageHeader
        title={isPending ? 'Welcome' : (company?.name ?? 'Your company')}
        description="Your postings and who has applied to them."
        actions={
          <>
            <Button as={Link} to="/jobs/new" variant="primary" size="md">
              Post a job
            </Button>
            <Button as={Link} to="/jobs" variant="secondary" size="md">
              Your postings
            </Button>
          </>
        }
      />

      {/* Until the office verifies a company, nothing it posts reaches a student. */}
      {company && !company.verified && (
        <Card className="mt-6 border-warning-line bg-warning-soft/50">
          <div className="flex flex-wrap items-center gap-3">
            <ShieldAlert size={20} strokeWidth={1.5} aria-hidden className="text-warning" />
            <p className="flex-1 text-sm">
              <span className="font-medium">Awaiting verification.</span>{' '}
              <span className="text-muted">
                The placement office verifies each company before its postings go live.
              </span>
            </p>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Live postings" tone="good" value={counts.approved ?? 0} />
        <StatTile label="Awaiting approval" tone="highlight" value={counts.pending ?? 0} />
        <StatTile label="Applicants" tone="accent" value={apps.length} />
        <StatTile
          label="Offers made"
          tone="info"
          value={apps.filter((a) => a.status === 'offered').length}
        />
      </div>

      {company && (
        <Card className="mt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
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
        </Card>
      )}

      <InterviewList heading="Your upcoming interviews" />

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Latest applicants
          </h2>
          <Link to="/applicants" className="text-sm font-medium text-accent hover:underline">
            See all
          </Link>
        </div>

        <Card padding="" className="mt-3 overflow-hidden">
          {recent.length === 0 ? (
            <p className="p-5 text-sm text-muted">
              No one has applied yet. Students see a posting only after the office approves it.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-medium">{a.studentId?.name ?? 'Unknown student'}</span>
                  <FitBadge fit={a.fit} />
                  <StatusPill status={a.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">
                    {a.jobId?.title}
                  </span>
                  <span className="text-xs text-muted">{formatDate(a.appliedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
