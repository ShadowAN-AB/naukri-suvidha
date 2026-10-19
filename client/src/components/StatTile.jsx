/**
 * A single number, which is the right form when there is nothing to compare
 * it against. A chart here would be decoration.
 */
export default function StatTile({ label, value, suffix, hint, tone = 'default' }) {
  const toneText = {
    default: 'text-ink',
    good: 'text-emerald-700',
    warning: 'text-amber-700',
  }[tone];

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneText}`}>
        {value}
        {suffix && <span className="ml-1 text-base font-normal text-muted">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
