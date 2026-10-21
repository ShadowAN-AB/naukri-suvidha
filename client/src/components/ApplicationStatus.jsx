import Badge from './ui/Badge.jsx';

const STAGES = ['applied', 'shortlisted', 'interview', 'offered'];

const TONES = {
  applied: 'neutral',
  shortlisted: 'info',
  interview: 'warning',
  offered: 'success',
  rejected: 'danger',
  withdrawn: 'muted',
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
  return <Badge tone={TONES[status] ?? 'neutral'}>{LABELS[status] ?? status}</Badge>;
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
