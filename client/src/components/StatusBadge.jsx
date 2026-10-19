const STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
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
