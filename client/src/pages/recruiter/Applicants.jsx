import { useState } from 'react';
import { useApplications, useChangeStatus } from '../../api/applications.js';
import { useJobs } from '../../api/jobs.js';
import { StatusPill } from '../../components/ApplicationStatus.jsx';
import FitScore, { FitBadge } from '../../components/FitScore.jsx';
import ProtectedFileLink from '../../components/ProtectedFileLink.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ScheduleInterview from '../../components/ScheduleInterview.jsx';
import { formatDate } from '../../lib/format.js';
import { APPLICATION_TRANSITIONS } from '@nexus/shared';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ListSkeleton } from '../../components/ui/Skeleton.jsx';

const NEXT_LABEL = {
  shortlisted: 'Shortlist',
  interview: 'To interview',
  offered: 'Make offer',
  rejected: 'Reject',
};

export default function Applicants() {
  const [jobId, setJobId] = useState('');
  // 50 is the schema's ceiling; 100 came back 400 and left the filter empty.
  const { data: jobsData } = useJobs({ limit: 50 });
  const { data, isPending } = useApplications({ jobId: jobId || undefined, limit: 100 });
  const changeStatus = useChangeStatus();
  const toast = useToast();
  const [scheduling, setScheduling] = useState(null);

  const jobs = jobsData?.items ?? [];
  const items = data?.items ?? [];

  const move = (id, status) => {
    changeStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Moved to ${NEXT_LABEL[status] ?? status}.`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Applicants"
          description={isPending ? 'Loading…' : `${items.length} across your postings · best fit first`}
        />
        <label className="text-sm">
          <span className="sr-only">Filter by job</span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="">All postings</option>
            {jobs.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 space-y-4">
        {isPending && <ListSkeleton count={3} />}

        {!isPending && items.length === 0 && (
          <EmptyState title="No applicants yet">
            Students see a posting only after the placement office approves it.
          </EmptyState>
        )}

        {items.map((a) => {
          const s = a.studentId ?? {};
          const next = APPLICATION_TRANSITIONS[a.status] ?? [];
          return (
            <article key={a._id} className="rounded-xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold tracking-tight">{s.name ?? 'Unknown student'}</h2>
                <FitBadge fit={a.fit} />
                <StatusPill status={a.status} />
                <span className="ml-auto text-sm text-muted">applied {formatDate(a.appliedAt)}</span>
              </div>

              <p className="mt-0.5 text-sm text-muted">
                {s.rollNo} · {s.branch} {s.batchYear} · CGPA {s.cgpa} ·{' '}
                {s.backlogs ? `${s.backlogs} backlogs` : 'no backlogs'}
              </p>
              <p className="mt-1 text-sm text-muted">for {a.jobId?.title}</p>

              <FitScore fit={a.fit} />

              {s.skills?.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {s.skills.slice(0, 10).map((skill) => (
                    <li key={skill} className="rounded bg-highlight-soft/60 px-2 py-0.5 text-xs font-medium text-highlight-strong">
                      {skill}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {s.currentResumeId && (
                  <ProtectedFileLink path={`/resumes/${s.currentResumeId}/file`}>
                    Résumé
                  </ProtectedFileLink>
                )}
                <span className="ml-auto flex flex-wrap gap-2">
                  {['shortlisted', 'interview'].includes(a.status) && (
                    <Button variant="secondary" size="sm"
                      onClick={() => setScheduling(scheduling === a._id ? null : a._id)}>
                      Schedule
                    </Button>
                  )}
                  {next.length === 0 && <span className="text-sm text-muted">No further action</span>}
                  {next.map((status) => (
                    <button
                      key={status}
                      onClick={() => move(a._id, status)}
                      disabled={changeStatus.isPending}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                        status === 'rejected'
                          ? 'border border-line hover:bg-subtle'
                          : 'bg-accent-solid text-on-solid hover:opacity-90'
                      }`}
                    >
                      {NEXT_LABEL[status] ?? status}
                    </button>
                  ))}
                </span>
              </div>
              {scheduling === a._id && (
                <ScheduleInterview applicationId={a._id} onDone={() => setScheduling(null)} />
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
