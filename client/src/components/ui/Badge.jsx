const TONES = {
  neutral: 'bg-subtle text-chip-ink ring-line',
  muted: 'bg-subtle text-muted ring-line',
  accent: 'bg-accent-soft text-accent-strong ring-accent-line',
  highlight: 'bg-highlight-soft text-highlight-strong ring-highlight-line',
  info: 'bg-info-soft text-info-strong ring-info-line',
  success: 'bg-success-soft text-success ring-success-line',
  warning: 'bg-warning-soft text-warning ring-warning-line',
  danger: 'bg-danger-soft text-danger ring-danger-line',
};

/** The pill. Four files had their own copy of these exact classes. */
export default function Badge({ tone = 'neutral', className = '', children, ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        TONES[tone] ?? TONES.neutral
      } ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
