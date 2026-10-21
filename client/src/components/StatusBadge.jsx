import Badge from './ui/Badge.jsx';

const TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  closed: 'neutral',
};

const LABELS = {
  pending: 'Awaiting approval',
  approved: 'Live',
  rejected: 'Rejected',
  closed: 'Closed',
};

export default function StatusBadge({ status }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{LABELS[status] ?? status}</Badge>;
}
