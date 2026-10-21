/**
 * Shaped like the thing it stands in for, so the page does not jump when the
 * data lands. Hidden from assistive tech - the live region that announces the
 * real content is the one worth hearing.
 */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-track ${className}`} />;
}

/** A card-shaped placeholder, so a loading list occupies the space it will. */
export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3, lines = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} lines={lines} />
      ))}
    </div>
  );
}
