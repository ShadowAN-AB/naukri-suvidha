const STYLES = {
  pending: 'bg-warning-soft text-warning ring-warning-line',
  approved: 'bg-success-soft text-success ring-success-line',
  rejected: 'bg-danger-soft text-danger ring-danger-line',
  closed: 'bg-subtle text-chip-ink ring-line',
};

const LABELS = {
  pending: 'Awaiting approval',
  approved: 'Live',
  rejected: 'Rejected',
  closed: 'Closed',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STYLES[status] ?? STYLES.closed
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
