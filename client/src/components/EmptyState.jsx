import { Inbox } from 'lucide-react';

/**
 * Never a blank panel: something to look at, what the state means, and the
 * one thing worth doing about it.
 */
export default function EmptyState({ title, icon: Icon = Inbox, action, children }) {
  return (
    <div className="rounded-xl border border-dashed border-info-line bg-info-soft/40 p-10 text-center">
      <Icon
        size={28}
        strokeWidth={1.5}
        aria-hidden
        className="mx-auto mb-3 text-info-strong opacity-70"
      />
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
