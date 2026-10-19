export default function EmptyState({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 p-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
    </div>
  );
}
