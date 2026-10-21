/** Form inputs: the taller control, used inside a labelled Field. */
export const inputClasses = (invalid = false) =>
  `w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-muted focus-visible:outline-none focus:ring-2 focus:ring-accent/30 ${
    invalid ? 'border-danger' : 'border-line focus:border-accent'
  }`;

/** Toolbar controls: the shorter search box and filter selects. */
export const controlClasses =
  'rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-muted focus-visible:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';
