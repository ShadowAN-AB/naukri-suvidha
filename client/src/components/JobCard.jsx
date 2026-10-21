import Badge from './ui/Badge.jsx';
import Card from './ui/Card.jsx';
import StatusBadge from './StatusBadge.jsx';
import FitScore, { FitBadge } from './FitScore.jsx';
import { inr, formatDate, daysLeft } from '../lib/format.js';

/**
 * One job, shown to whoever is looking at it. A student sees why they are or
 * are not eligible; a recruiter and an admin see its approval status.
 */
export default function JobCard({ job, showStatus = false, actions = null, showFit = false }) {
  const company = job.companyId ?? {};
  const eligibility = job.eligibility;

  return (
    <Card as="article">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold tracking-tight">{job.title}</h3>
        {showStatus && <StatusBadge status={job.status} />}
        {showFit && <FitBadge fit={job.fit} />}
        {eligibility && !eligibility.eligible && (
          <Badge>Not eligible</Badge>
        )}
      </div>

      <p className="mt-0.5 text-sm text-muted">
        {company.name ?? 'Unknown company'}
        {job.location ? ` · ${job.location}` : ''}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="font-medium">{inr(job.ctcLpa)}</span>
        <span className="text-muted">Min CGPA {job.minCgpa}</span>
        <span className="text-muted">
          {job.maxBacklogs === 0 ? 'No backlogs' : `Up to ${job.maxBacklogs} backlogs`}
        </span>
        <span className="text-muted">
          {job.allowedBranches?.length ? job.allowedBranches.join(', ') : 'All branches'}
        </span>
      </div>

      {job.skillsRequired?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {job.skillsRequired.map((s) => (
            <li key={s} className="rounded bg-accent-soft/60 px-2 py-0.5 text-xs font-medium text-accent-strong">
              {s}
            </li>
          ))}
        </ul>
      )}

      {showFit && <FitScore fit={job.fit} />}

      {eligibility && !eligibility.eligible && (
        <ul className="mt-3 space-y-0.5 border-l-2 border-line pl-3 text-sm text-muted">
          {eligibility.failures.map((f) => (
            <li key={f.rule}>{f.message}</li>
          ))}
        </ul>
      )}

      {job.status === 'rejected' && job.rejectionReason && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          Rejected: {job.rejectionReason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          {daysLeft(job.deadline)} · closes {formatDate(job.deadline)}
        </span>
        {actions && <span className="ml-auto flex gap-2">{actions}</span>}
      </div>
    </Card>
  );
}
