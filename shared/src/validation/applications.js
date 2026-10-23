import { z } from 'zod';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'That does not look like a valid id');

export const applySchema = z.object({
  jobId: objectId,
});

/**
 * The pipeline, and who may move an application where.
 *
 * A recruiter drives their own funnel. A student may only ever withdraw, and
 * only before an offer exists. Nothing moves out of a terminal state, so a
 * rejection cannot be quietly reversed after the fact.
 */
export const APPLICATION_TRANSITIONS = Object.freeze({
  applied: ['shortlisted', 'rejected'],
  shortlisted: ['interview', 'offered', 'rejected'],
  interview: ['offered', 'rejected'],
  offered: [],
  rejected: [],
  withdrawn: [],
});

export const RECRUITER_STATUSES = Object.freeze([
  'shortlisted',
  'interview',
  'offered',
  'rejected',
]);

export const changeStatusSchema = z.object({
  status: z.enum(RECRUITER_STATUSES, {
    error: 'Choose a valid stage',
  }),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export const applicationListQuerySchema = z.object({
  jobId: objectId.optional(),
  status: z
    .enum(['applied', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** @returns {boolean} whether `to` is reachable from `from`. */
export function canTransition(from, to) {
  return (APPLICATION_TRANSITIONS[from] ?? []).includes(to);
}
