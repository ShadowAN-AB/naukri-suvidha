import { useApplications, useWithdraw } from '../../api/applications.js';
import { StatusPill, StageTrack } from '../../components/ApplicationStatus.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import InterviewList from '../../components/InterviewList.jsx';
import { formatDate, inr } from '../../lib/format.js';

const CAN_WITHDRAW = ['applied', 'shortlisted', 'interview'];

export default function Applications() {
  const { data, isPending } = useApplications({ limit: 100 });
  const withdraw = useWithdraw();
  const items = data?.items ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your applications</h1>
      <p className="mt-1 text-muted">
        {isPending ? 'Loading…' : `${items.length} application${items.length === 1 ? '' : 's'}`}
      </p>

      <InterviewList heading="Your upcoming interviews" />

      <div className="mt-6 space-y-4">
        {!isPending && items.length === 0 && (
          <EmptyState title="You have not applied to anything yet">
            Open jobs you are eligible for appear under Jobs.
          </EmptyState>
        )}

        {items.map((a) => (
          <article key={a._id} className="rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight">
                {a.jobId?.title ?? 'A job that no longer exists'}
              </h2>
              <StatusPill status={a.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {a.jobId?.companyId?.name ?? '—'}
              {a.jobId?.ctcLpa != null ? ` · ${inr(a.jobId.ctcLpa)}` : ''}
            </p>

            <div className="mt-4">
              <StageTrack status={a.status} />
            </div>

            <ol className="mt-4 space-y-1.5 border-l-2 border-line pl-4 text-sm">
              {a.timeline.map((t, i) => (
                <li key={i} className="text-muted">
                  <span className="font-medium text-ink">{t.status}</span>
                  {' · '}
                  {formatDate(t.at)}
                  {t.note ? ` · ${t.note}` : ''}
                </li>
              ))}
            </ol>

            {CAN_WITHDRAW.includes(a.status) && (
              <div className="mt-4 border-t border-line pt-3">
                <button
                  onClick={() => withdraw.mutate(a._id)}
                  disabled={withdraw.isPending}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Withdraw
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
