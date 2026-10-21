import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNotifications, useMarkRead, useMarkAllRead } from '../api/notifications.js';
import { useRealtime } from '../context/RealtimeContext.jsx';

function ago(date) {
  const seconds = Math.round((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const { connected } = useRealtime();
  const navigate = useNavigate();
  const ref = useRef(null);

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-subtle"
      >
        Alerts
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-accent-solid text-[11px] font-semibold text-on-solid">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-medium">Notifications</span>
            <span className="flex items-center gap-2">
              <span
                title={connected ? 'Live updates connected' : 'Reconnecting'}
                className={`size-1.5 rounded-full ${connected ? 'bg-success' : 'bg-muted'}`}
              />
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </span>
          </div>

          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted">Nothing yet.</li>
            )}
            {items.map((n) => (
              <li key={n._id}>
                <button
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n._id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                  className={`block w-full px-4 py-3 text-left transition hover:bg-subtle ${
                    n.readAt ? '' : 'bg-accent-soft/50'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{ago(n.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
