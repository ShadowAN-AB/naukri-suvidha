const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-accent-solid text-on-solid hover:bg-accent-solid-hover',
  secondary: 'border border-line bg-card text-ink hover:bg-subtle',
  danger: 'bg-danger-solid text-on-solid hover:bg-danger-solid-hover',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function buttonClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `${BASE} ${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size] ?? SIZES.md} ${className}`.trim();
}

/**
 * `as` exists because half these buttons are router Links. Keeping one set of
 * styles matters more than the tag: a Link that looks like a button and a
 * button that looks like a Link were drifting apart in nine files.
 *
 * No default `type`: several of these sit inside forms and rely on being
 * submit buttons.
 */
export default function Button({ variant, size, className, as: As = 'button', ...props }) {
  return <As className={buttonClasses({ variant, size, className })} {...props} />;
}
