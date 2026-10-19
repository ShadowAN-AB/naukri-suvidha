import { z } from 'zod';
import { BRANCHES } from '../constants.js';

const title = z.string().trim().min(3, 'Title is required').max(120);
const description = z.string().trim().min(20, 'Describe the role in at least 20 characters').max(8000);

export const jobCreateSchema = z.object({
  title,
  description,
  location: z.string().trim().max(80).optional().or(z.literal('')),
  skillsRequired: z
    .array(z.string().trim().min(1).max(40))
    .max(20, 'At most 20 skills')
    .default([]),
  minCgpa: z.coerce.number().min(0, 'CGPA must be 0 or more').max(10, 'CGPA must be 10 or less').default(0),
  maxBacklogs: z.coerce.number().int().min(0, 'Cannot be negative').max(50).default(0),
  allowedBranches: z.array(z.enum(BRANCHES)).max(BRANCHES.length).default([]),
  ctcLpa: z.coerce.number().min(0, 'CTC must be 0 or more').max(1000),
  deadline: z.coerce.date().refine((d) => d > new Date(), 'The deadline must be in the future'),
});

/** Every field optional, but at least one must be present. */
export const jobUpdateSchema = jobCreateSchema
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
