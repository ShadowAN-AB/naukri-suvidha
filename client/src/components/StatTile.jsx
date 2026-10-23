/**
 * A single number, which is the right form when there is nothing to compare
 * it against. A chart here would be decoration.
 */
const TONES = {
  default: 'border-line bg-card text-ink',
  accent: 'border-accent-line bg-accent-soft/50 text-accent-strong',
  highlight: 'border-highlight-line bg-highlight-soft/50 text-highlight-strong',
  info: 'border-info-line bg-info-soft/60 text-info-strong',
  good: 'border-success-line bg-success-soft/60 text-success',
  warning: 'border-warning-line bg-warning-soft/60 text-warning',
};

export default function StatTile({ label, value, suffix, hint, tone = 'default' }) {
  const [border, bg, toneText] = TONES[tone].split(' ');

  return (
    <div className={`rounded-xl border p-5 ${border} ${bg}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneText}`}>
        {value}
        {suffix && <span className="ml-1 text-base font-normal text-muted">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
