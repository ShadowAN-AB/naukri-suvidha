const STAGES = ['applied', 'shortlisted', 'interview', 'offered'];

const STYLES = {
  applied: 'bg-slate-100 text-slate-700 ring-slate-200',
  shortlisted: 'bg-blue-50 text-blue-700 ring-blue-200',
  interview: 'bg-amber-50 text-amber-700 ring-amber-200',
  offered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  withdrawn: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const LABELS = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offer',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

export function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status] ?? STYLES.applied}`}>
      {LABELS[status] ?? status}
    </span>
  );
}

/** Four dots showing how far along the funnel an application has reached. */
export function StageTrack({ status }) {
  const ended = status === 'rejected' || status === 'withdrawn';
  const reached = STAGES.indexOf(status);

  return (
    <ol className="flex items-center gap-1" aria-label={`Stage: ${LABELS[status] ?? status}`}>
      {STAGES.map((stage, i) => (
        <li
          key={stage}
          title={LABELS[stage]}
          className={`h-1.5 w-8 rounded-full ${
            ended
              ? 'bg-slate-200'
              : i <= reached
                ? 'bg-accent'
                : 'bg-slate-200'
          }`}
        />
      ))}
    </ol>
  );
}
