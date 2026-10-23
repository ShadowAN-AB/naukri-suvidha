/** Attempts before a delivery is left for someone to look at. */
export const MAX_DELIVERY_ATTEMPTS = 5;

const BASE_MS = 5_000;
const CEILING_MS = 10 * 60_000;

/**
 * Exponential, capped: 10s, 20s, 40s, 80s, 160s.
 *
 * A notification that failed because Mongo blinked wants the first retry
 * quickly; one failing because of a bug wants the gaps to widen rather than
 * spin. The cap keeps the last attempt inside ten minutes either way.
 */
export function backoffFrom(attempts) {
  const delay = Math.min(BASE_MS * 2 ** attempts, CEILING_MS);
  return new Date(Date.now() + delay);
}
