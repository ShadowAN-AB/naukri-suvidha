/** Says plainly what this screen will hold, and which phase fills it in. */
export default function PhaseNotice({ phase, children }) {
  return (
    <div className="mt-8 rounded-xl border border-dashed border-line bg-white/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Arriving in phase {phase}
      </p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}
