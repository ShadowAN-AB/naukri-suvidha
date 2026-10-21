import { Link } from 'react-router-dom';
import { useJobs, useCloseJob } from '../../api/jobs.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PageHeader from '../../components/PageHeader.jsx';

export default function RecruiterJobs() {
  const { data, isPending } = useJobs({ limit: 50 });
  const closeJob = useCloseJob();
  const jobs = data?.items ?? [];

  const counts = jobs.reduce((acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }), {});

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Your postings"
          description={
            isPending
              ? 'Loading…'
              : `${counts.approved ?? 0} live · ${counts.pending ?? 0} awaiting approval · ${counts.rejected ?? 0} rejected`
          }
        />
        <Link
          to="/jobs/new"
          className="rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-on-solid transition hover:opacity-90"
        >
          Post a job
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {!isPending && jobs.length === 0 && (
          <EmptyState title="No postings yet">
            Post a job and the placement office will review it. Students see it only once it
            is approved.
          </EmptyState>
        )}
        {jobs.map((job) => (
          <JobCard
            key={job._id}
            job={job}
            showStatus
            actions={
              job.status !== 'closed' && (
                <button
                  onClick={() => closeJob.mutate(job._id)}
                  disabled={closeJob.isPending}
                  className="rounded-lg border border-line px-3 py-1.5 font-medium transition hover:bg-subtle disabled:opacity-50"
                >
                  Close
                </button>
              )
            }
          />
        ))}
      </div>
    </>
  );
}
