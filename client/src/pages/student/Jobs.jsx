import { useState } from 'react';
import { useJobs } from '../../api/jobs.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';

export default function StudentJobs() {
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isPending, isError, error } = useJobs({ eligibleOnly, search, limit: 50 });

  const jobs = data?.items ?? [];
  const eligibleCount = jobs.filter((j) => j.eligibility?.eligible).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Open jobs</h1>
          <p className="mt-1 text-muted">
            {isPending
              ? 'Loading…'
              : eligibleOnly
                ? `${data.total} you can apply to`
                : `${data.total} open · you are eligible for ${eligibleCount}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles…"
            aria-label="Search jobs"
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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

      {isError && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {!isPending && jobs.length === 0 && (
          <EmptyState title="Nothing open right now">
            {eligibleOnly
              ? 'No open job matches your CGPA, backlogs and branch. Turn off "eligible only" to see everything and what each one needs.'
              : 'Once the placement office approves a posting it will appear here.'}
          </EmptyState>
        )}
        {jobs.map((job) => (
          <JobCard key={job._id} job={job} />
        ))}
      </div>
    </>
  );
}
