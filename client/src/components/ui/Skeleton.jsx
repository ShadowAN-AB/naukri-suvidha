/**
 * Shaped like the thing it stands in for, so the page does not jump when the
 * data lands. Hidden from assistive tech - the live region that announces the
 * real content is the one worth hearing.
 */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-track ${className}`} />;
}
