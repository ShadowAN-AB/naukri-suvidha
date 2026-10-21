import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useJobs } from '../../api/jobs.js';
import { useApplications, useApply } from '../../api/applications.js';
import { useMyResumes } from '../../api/resumes.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';

export default function StudentJobs() {
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const { data, isPending, isError, error: listError } = useJobs({ eligibleOnly, search, limit: 50 });
  const { data: applicationsData } = useApplications({ limit: 100 });
  const { data: resumesData } = useMyResumes();
  const apply = useApply();

  const jobs = data?.items ?? [];
  const eligibleCount = jobs.filter((j) => j.eligibility?.eligible).length;
  const hasResume = Boolean(resumesData?.currentResumeId);

  // Which jobs this student has already applied to, so the button can say so.
  const appliedTo = new Map(
    (applicationsData?.items ?? []).map((a) => [String(a.jobId?._id ?? a.jobId), a.status]),
  );

  const onApply = (job) => {
    apply.mutate(job._id, {
      onSuccess: () => toast.success(`Applied to ${job.title}.`),
      onError: (err) =>
        toast.error(err.details?.eligibility ?? err.details?.resume ?? err.message),
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Open jobs"
          description={
            isPending
              ? 'Loading…'
              : eligibleOnly
                ? `${data.total} you can apply to`
                : `${data.total} open · eligible for ${eligibleCount} · best fit first`
          }
        />

        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles…"
            aria-label="Search jobs"
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={eligibleOnly}
              onChange={(e) => setEligibleOnly(e.target.checked)}
              className="size-4 rounded border-line"
            />
            Eligible only
          </label>
        </div>
      </div>

      {!hasResume && (
        <p className="mt-6 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          You need a résumé on file before you can apply.{' '}
          <Link to="/resume" className="font-medium underline">
            Upload one
          </Link>
          .
        </p>
      )}

      {isError && (
        <p role="alert" className="mt-6 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {listError.message}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {isPending && <ListSkeleton count={3} lines={2} />}

        {!isPending && jobs.length === 0 && (
          <EmptyState title="Nothing open right now">
            {eligibleOnly
              ? 'No open job matches your CGPA, backlogs and branch. Turn off "eligible only" to see everything and what each one needs.'
              : 'Once the placement office approves a posting it will appear here.'}
          </EmptyState>
        )}

        {jobs.map((job) => {
          const applied = appliedTo.get(String(job._id));
          const canApply = job.eligibility?.eligible && hasResume && !applied;

          return (
            <JobCard
              key={job._id}
              job={job}
              showFit
              actions={
                applied ? (
                  <Link to="/applications" className="text-sm font-medium text-accent hover:underline">
                    Applied · {applied}
                  </Link>
                ) : (
                  <Button variant="primary" size="sm" className="disabled:cursor-not-allowed"
                    onClick={() => onApply(job)}
                    disabled={!canApply || apply.isPending}
                    title={
                      !job.eligibility?.eligible
                        ? 'You do not meet this job’s requirements'
                        : !hasResume
                          ? 'Upload a résumé first'
                          : undefined
                    }>
                    {apply.isPending ? 'Applying…' : 'Apply'}
                  </Button>
                )
              }
            />
          );
        })}
      </div>
    </>
  );
}
