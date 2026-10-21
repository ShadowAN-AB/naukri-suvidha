import Badge from './ui/Badge.jsx';

/**
 * A fit score with the reasoning behind it.
 *
 * The number alone is not useful to a student deciding where to spend an
 * application, so the breakdown and the model's own explanation are shown
 * next to it. A fallback score says so plainly rather than passing a guess
 * off as a judgement.
 */

function band(score) {
  if (score >= 80) return { tone: 'success', text: 'text-success', bar: 'bg-success' };
  if (score >= 60) return { tone: 'accent', text: 'text-accent-strong', bar: 'bg-accent' };
  if (score >= 40) return { tone: 'info', text: 'text-info-strong', bar: 'bg-info' };
  return { tone: 'neutral', text: 'text-chip-ink', bar: 'bg-muted' };
}

const PARTS = [
  ['skills', 'Skills'],
  ['experience', 'Experience'],
  ['education', 'Education'],
];

/** The compact number, for a card header. */
export function FitBadge({ fit }) {
  if (!fit) {
    return <Badge tone="muted">Scoring…</Badge>;
  }
  const c = band(fit.score);
  return (
    <Badge
      tone={c.tone}
      className="font-semibold"
      title={fit.fallback ? 'Estimated without the model' : `Scored by ${fit.model}`}
    >
      {fit.score}
      <span className="font-normal opacity-70">fit</span>
      {fit.fallback && <span className="font-normal opacity-70">· est.</span>}
    </Badge>
  );
}

/** The full panel: breakdown bars plus the reasoning. */
export default function FitScore({ fit }) {
  if (!fit) {
    return (
      <p className="mt-3 text-sm text-muted">
        Not scored yet — the AI layer works through new jobs in the background.
      </p>
    );
  }

  const c = band(fit.score);

  return (
    <div className="mt-3 rounded-lg border border-line bg-subtle/60 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={`text-lg font-semibold tabular-nums ${c.text}`}>{fit.score}</span>

        <dl className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
          {PARTS.map(([key, label]) => (
            <div key={key} className="min-w-24 flex-1">
              <div className="flex justify-between text-xs text-muted">
                <dt>{label}</dt>
                <dd className="tabular-nums">{fit.breakdown?.[key] ?? '—'}</dd>
              </div>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-track">
                <div
                  className={`h-full rounded-full ${c.bar}`}
                  style={{ width: `${Math.max(0, Math.min(100, fit.breakdown?.[key] ?? 0))}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
      </div>

      {fit.reasoning && <p className="mt-2.5 text-sm text-muted">{fit.reasoning}</p>}

      <p className="mt-2 text-xs text-muted">
        {fit.fallback ? (
          <>
            Estimated by skill matching, not by the model, and capped at 70. The AI layer was
            unavailable when this was computed.
          </>
        ) : (
          <>Scored by {fit.model}.</>
        )}
      </p>
    </div>
  );
}
