import { useState } from 'react';
import { useJobs, useApproveJob, useRejectJob } from '../../api/jobs.js';
import JobCard from '../../components/JobCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';

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
        <Button variant="danger" size="sm"
          onClick={() => onConfirm(reason.trim())}
          disabled={tooShort || busy}>
          Confirm rejection
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const { data, isPending } = useJobs({ status: 'pending', limit: 50 });
  const approve = useApproveJob();
  const reject = useRejectJob();
  const [rejecting, setRejecting] = useState(null);
  const toast = useToast();

  const jobs = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Approval queue"
        description={`${
          isPending ? 'Loading…' : `${jobs.length} posting${jobs.length === 1 ? '' : 's'} waiting`
        }. Nothing here is visible to students yet.`}
      />

      <div className="mt-6 space-y-4">
        {isPending && <ListSkeleton count={2} />}

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
                  <Button variant="primary" size="sm"
                    onClick={() =>
                      approve.mutate(job._id, {
                        onSuccess: () => toast.success(`${job.title} is live.`),
                        onError: (err) => toast.error(err.message),
                      })
                    }
                    disabled={approve.isPending}>
                    Approve
                  </Button>
                  <Button variant="secondary" size="sm"
                    onClick={() => setRejecting(rejecting === job._id ? null : job._id)}>
                    Reject
                  </Button>
                </>
              }
            />
            {rejecting === job._id && (
              <RejectDialog
                job={job}
                busy={reject.isPending}
                onCancel={() => setRejecting(null)}
                onConfirm={(reason) =>
                  reject.mutate(
                      { id: job._id, reason },
                      {
                        onSuccess: () => {
                          setRejecting(null);
                          toast.success(`${job.title} was rejected.`);
                        },
                        onError: (err) => toast.error(err.message),
                      },
                    )
                }
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
