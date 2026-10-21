import { useInterviews } from '../api/interviews.js';

const MODE_LABEL = { online: 'Online', onsite: 'On site', phone: 'Phone' };

function when(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Upcoming interviews, for whoever is looking - student or recruiter. */
export default function InterviewList({ heading = 'Interviews', emptyText }) {
  const { data, isPending } = useInterviews();
  const items = (data?.items ?? []).filter((i) => i.status === 'scheduled');

  if (isPending) return null;
  if (items.length === 0) {
    return emptyText ? <p className="mt-2 text-sm text-muted">{emptyText}</p> : null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{heading}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((i) => {
          const app = i.applicationId ?? {};
          const job = app.jobId ?? {};
          return (
            <li key={i._id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{job.title ?? 'An interview'}</span>
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning-line">
                  {MODE_LABEL[i.mode] ?? i.mode}
                </span>
                <span className="ml-auto text-sm font-medium tabular-nums">{when(i.scheduledAt)}</span>
              </div>

              <p className="mt-0.5 text-sm text-muted">
                {job.companyId?.name ?? app.studentId?.name ?? ''}
                {i.durationMinutes ? ` · ${i.durationMinutes} minutes` : ''}
              </p>

              {i.meetingLink && (
                <a
                  href={i.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
                >
                  Join the meeting
                </a>
              )}
              {i.location && <p className="mt-2 text-sm text-muted">{i.location}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
