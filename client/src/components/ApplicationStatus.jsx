const STAGES = ['applied', 'shortlisted', 'interview', 'offered'];

const STYLES = {
  applied: 'bg-subtle text-chip-ink ring-line',
  shortlisted: 'bg-info-soft text-info ring-info-line',
  interview: 'bg-warning-soft text-warning ring-warning-line',
  offered: 'bg-success-soft text-success ring-success-line',
  rejected: 'bg-danger-soft text-danger ring-danger-line',
  withdrawn: 'bg-subtle text-muted ring-line',
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
              ? 'bg-track'
              : i <= reached
                ? 'bg-accent-solid'
                : 'bg-track'
          }`}
        />
      ))}
    </ol>
  );
}
