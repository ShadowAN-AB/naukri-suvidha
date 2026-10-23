import { Link } from 'react-router-dom';
import { FileWarning } from 'lucide-react';

import { useMe } from '../../api/auth.js';
import { useApplications } from '../../api/applications.js';
import { useMyResumes } from '../../api/resumes.js';
import { useJobs } from '../../api/jobs.js';
import PageHeader from '../../components/PageHeader.jsx';
import InterviewList from '../../components/InterviewList.jsx';
import JobCard from '../../components/JobCard.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import StatTile from '../../components/StatTile.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';

/* Counted rather than summed: an application sits in exactly one stage. */
const FUNNEL = [
  ['applied', 'Applied', 'accent'],
  ['shortlisted', 'Shortlisted', 'highlight'],
  ['interview', 'Interviews', 'warning'],
  ['offered', 'Offers', 'good'],
];

export default function StudentDashboard() {
  const { data, isPending } = useMe();
  const profile = data?.profile;

  const { data: resumesData } = useMyResumes();
  const { data: appsData } = useApplications({ limit: 100 });
  const { data: jobsData, isPending: jobsPending } = useJobs({ eligibleOnly: true, limit: 3 });

  const apps = appsData?.items ?? [];
  const hasResume = Boolean(resumesData?.currentResumeId);
  const matches = jobsData?.items ?? [];

  return (
    <>
      <PageHeader
        title={isPending ? 'Welcome' : `Welcome, ${profile?.name ?? 'student'}`}
        description="Where your applications stand, and what is worth applying to next."
        actions={
          <Button as={Link} to="/jobs" variant="primary" size="md">
            Browse open jobs
          </Button>
        }
      />

      {/*
        The one thing that blocks everything else, so it goes above the
        numbers rather than being discovered on the jobs page at the moment
        of trying to apply.
      */}
      {!hasResume && (
        <Card className="mt-6 border-warning-line bg-warning-soft/50">
          <div className="flex flex-wrap items-center gap-3">
            <FileWarning size={20} strokeWidth={1.5} aria-hidden className="text-warning" />
            <p className="flex-1 text-sm">
              <span className="font-medium">No résumé on file.</span>{' '}
              <span className="text-muted">You cannot apply to anything until you upload one.</span>
            </p>
            <Button as={Link} to="/resume" variant="primary" size="sm">
              Upload a résumé
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FUNNEL.map(([key, label, tone]) => (
          <StatTile
            key={key}
            label={label}
            tone={tone}
            value={apps.filter((a) => a.status === key).length}
          />
        ))}
      </div>

      {profile && (
        <Card className="mt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
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
        </Card>
      )}

      <InterviewList heading="Your upcoming interviews" />

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Best matches for you
          </h2>
          <Link to="/jobs" className="text-sm font-medium text-accent hover:underline">
            See all
          </Link>
        </div>

        <div className="mt-3 space-y-4">
          {jobsPending && <ListSkeleton count={2} lines={2} />}
          {!jobsPending && matches.length === 0 && (
            <Card className="text-sm text-muted">
              Nothing you are eligible for is open yet. The jobs page explains what each
              posting needs.
            </Card>
          )}
          {matches.map((job) => (
            <JobCard key={job._id} job={job} showFit />
          ))}
        </div>
      </section>
    </>
  );
}
