import { z } from 'zod';
import { BRANCHES } from '../constants.js';

const title = z.string().trim().min(3, 'Title is required').max(120);
const description = z.string().trim().min(20, 'Describe the role in at least 20 characters').max(8000);

/*
 * The field shapes, deliberately without defaults.
 *
 * A default belongs to creation and nowhere else. Zod 4 keeps a field's
 * default through `.partial()` where Zod 3 dropped it, so an update schema
 * built from a base that carries defaults fills in every untouched field:
 * editing only the description would send `minCgpa: 0` and
 * `allowedBranches: []` as well. The jobs service assigns the patch straight
 * onto the document, so a recruiter fixing a typo would quietly reopen a
 * CSE-only, CGPA-6 posting to everyone.
 *
 * Keeping the defaults out of the shared shape makes that impossible rather
 * than merely unlikely.
 */
const fields = {
  title,
  description,
  location: z.string().trim().max(80).optional().or(z.literal('')),
  skillsRequired: z.array(z.string().trim().min(1).max(40)).max(20, 'At most 20 skills'),
  minCgpa: z.coerce.number().min(0, 'CGPA must be 0 or more').max(10, 'CGPA must be 10 or less'),
  maxBacklogs: z.coerce.number().int().min(0, 'Cannot be negative').max(50),
  allowedBranches: z.array(z.enum(BRANCHES)).max(BRANCHES.length),
  ctcLpa: z.coerce.number().min(0, 'CTC must be 0 or more').max(1000),
  deadline: z.coerce.date().refine((d) => d > new Date(), 'The deadline must be in the future'),
};

export const jobCreateSchema = z.object({
  ...fields,
  skillsRequired: fields.skillsRequired.default([]),
  minCgpa: fields.minCgpa.default(0),
  maxBacklogs: fields.maxBacklogs.default(0),
  allowedBranches: fields.allowedBranches.default([]),
});

/** Every field optional, but at least one must be present. */
export const jobUpdateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const jobRejectSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason the recruiter can act on').max(500),
});

export const jobListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'closed']).optional(),
  search: z.string().trim().max(120).optional(),
  eligibleOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
