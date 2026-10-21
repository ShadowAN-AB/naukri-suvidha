import { useState } from 'react';
import { useJobs, useApproveJob, useRejectJob } from '../../api/jobs.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';

function RejectDialog({ job, onCancel, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < 5;

  return (
    <div className="mt-3 rounded-lg border border-line bg-subtle p-3">
      <label htmlFor={`reason-${job._id}`} className="block text-sm font-medium">
        Why is this being rejected?
      </label>
      <p className="text-xs text-muted">The recruiter sees this, so make it something they can act on.</p>
      <textarea
        id={`reason-${job._id}`}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onConfirm(reason.trim())}
          disabled={tooShort || busy}
          className="rounded-lg bg-danger-solid px-3 py-1.5 text-sm font-medium text-on-solid transition hover:opacity-90 disabled:opacity-40"
        >
          Confirm rejection
        </button>
        <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-card">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const { data, isPending } = useJobs({ status: 'pending', limit: 50 });
  const approve = useApproveJob();
  const reject = useRejectJob();
  const [rejecting, setRejecting] = useState(null);

  const jobs = data?.items ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
      <p className="mt-1 text-muted">
        {isPending ? 'Loading…' : `${jobs.length} posting${jobs.length === 1 ? '' : 's'} waiting`}
        . Nothing here is visible to students yet.
      </p>

      <div className="mt-6 space-y-4">
        {!isPending && jobs.length === 0 && (
          <EmptyState title="Queue is empty">
            Every posting has been reviewed. New ones arrive here the moment a recruiter
            submits them.
          </EmptyState>
        )}

        {jobs.map((job) => (
          <div key={job._id}>
            <JobCard
              job={job}
              showStatus
              actions={
                <>
                  <button
                    onClick={() => approve.mutate(job._id)}
                    disabled={approve.isPending}
                    className="rounded-lg bg-accent-solid px-3 py-1.5 font-medium text-on-solid transition hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejecting(rejecting === job._id ? null : job._id)}
                    className="rounded-lg border border-line px-3 py-1.5 font-medium transition hover:bg-subtle"
                  >
                    Reject
                  </button>
                </>
              }
            />
            {rejecting === job._id && (
              <RejectDialog
                job={job}
                busy={reject.isPending}
                onCancel={() => setRejecting(null)}
                onConfirm={(reason) =>
                  reject.mutate({ id: job._id, reason }, { onSuccess: () => setRejecting(null) })
                }
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
