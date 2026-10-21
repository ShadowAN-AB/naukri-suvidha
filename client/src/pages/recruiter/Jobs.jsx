import { Link } from 'react-router-dom';
import { useJobs, useCloseJob } from '../../api/jobs.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';

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
        <Button as={Link} variant="primary" size="md"
          to="/jobs/new">
          Post a job
        </Button>
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
                <Button variant="secondary" size="sm"
                  onClick={() => closeJob.mutate(job._id)}
                  disabled={closeJob.isPending}>
                  Close
                </Button>
              )
            }
          />
        ))}
      </div>
    </>
  );
}
