export const inr = (lpa) => `${lpa} LPA`;

export function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function daysLeft(deadline) {
  const ms = new Date(deadline) - new Date();
  const days = Math.ceil(ms / 86400000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}
