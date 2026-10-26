import { ScrollText } from 'lucide-react';

import { useAuditLog, useAiHealth } from '../../api/admin.js';
import Badge from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import PageHeader from '../../components/PageHeader.jsx';

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
      <PageHeader
        title="Audit log"
        description="Every privileged action, append-only. Nothing here is edited or deleted."
      />

      {ai && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">AI layer</h2>
            <Badge tone={ai.provider.ok ? 'success' : 'warning'}>{ai.status}</Badge>
            <span className="text-sm text-muted">
              {ai.provider.name} · {ai.provider.model}
            </span>
            <span className="text-sm text-muted">queue {ai.queue.queued + ai.queue.pending}</span>
            <span className="text-sm text-muted">{ai.scores} scores</span>
            {ai.tasks?.dead > 0 && (
              <Badge tone="danger">{ai.tasks.dead} dead tasks</Badge>
            )}
          </div>

          {ai.degradedBehaviour && (
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              {ai.degradedBehaviour}
            </p>
          )}
          {/* The actionable half: which model is missing, not just that one is. */}
          {!ai.provider.ok && ai.provider.detail && (
            <p className="mt-2 text-xs text-muted">{ai.provider.detail}</p>
          )}
        </Card>
      )}

      <Card padding="" className="mt-6 overflow-hidden">
        {isPending && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}

        {!isPending && items.length === 0 && (
          <EmptyState title="Nothing logged yet" icon={ScrollText}>
            Actions appear here as people use the portal.
          </EmptyState>
        )}

        {/*
          A list rather than a table: three columns of wildly different widths
          do not survive 375px, and this has no column a reader sorts or
          compares down. The timestamp drops below the sentence on a phone and
          sits beside it from `sm` up.
        */}
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a._id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3 text-sm">
              <span className="order-2 w-full text-xs text-muted tabular-nums sm:order-none sm:w-36 sm:shrink-0">
                {new Date(a.at).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="order-1 min-w-0 flex-1 sm:order-none">
                {/* The actor is stored on the row, not joined: `users` belongs
                    to the auth service. An older row, or one written in
                    bearer mode where the access token carries no email,
                    falls back to the id and then to "system". */}
                <span className="font-medium">{a.actorEmail ?? a.actorId ?? 'system'}</span>{' '}
                <span className="text-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
              </span>
              <span className="order-3 shrink-0 text-xs text-muted sm:order-none">{a.entity}</span>
            </li>
          ))}
        </ul>
      </Card>

    </>
  );
}
