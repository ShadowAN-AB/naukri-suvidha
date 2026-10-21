import { useAuditLog, useAiHealth } from '../../api/admin.js';
import EmptyState from '../../components/EmptyState.jsx';

const ACTION_LABEL = {
  'auth.login': 'signed in',
  'auth.login_failed': 'failed to sign in',
  'auth.register': 'registered',
  'job.created': 'created a job',
  'job.updated': 'edited a job',
  'job.approved': 'approved a job',
  'job.rejected': 'rejected a job',
  'job.closed': 'closed a job',
  'application.submitted': 'applied',
  'application.status_changed': 'moved an application',
  'application.withdrawn': 'withdrew an application',
  'interview.scheduled': 'scheduled an interview',
  'interview.rescheduled': 'moved an interview',
  'interview.cancelled': 'cancelled an interview',
};

export default function AuditLog() {
  const { data, isPending } = useAuditLog(80);
  const { data: ai } = useAiHealth();
  const items = data?.items ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-1 text-muted">
        Every privileged action, append-only. Nothing here is edited or deleted.
      </p>

      {ai && (
        <div className="mt-6 rounded-xl border border-line bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">AI layer</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${ai.provider.ok ? 'bg-success' : 'bg-warning'}`}
                aria-hidden
              />
              <span className="font-medium">{ai.status}</span>
            </span>
            <span className="text-muted">
              {ai.provider.name} · {ai.provider.model}
            </span>
            <span className="text-muted">queue {ai.queue.queued + ai.queue.pending}</span>
            <span className="text-muted">{ai.scores} scores</span>
            {ai.tasks?.dead > 0 && (
              <span className="font-medium text-danger">{ai.tasks.dead} dead tasks</span>
            )}
          </div>
          {ai.degradedBehaviour && (
            <p className="mt-2 text-sm text-warning">{ai.degradedBehaviour}</p>
          )}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        {!isPending && items.length === 0 && (
          <EmptyState title="Nothing logged yet">
            Actions appear here as people use the portal.
          </EmptyState>
        )}

        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {items.map((a) => (
              <tr key={a._id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted tabular-nums">
                  {new Date(a.at).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{a.actorId?.email ?? 'system'}</span>{' '}
                  <span className="text-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-muted">{a.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
