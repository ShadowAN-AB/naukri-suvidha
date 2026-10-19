import { z } from 'zod';

/**
 * What the model is asked to return when it reads a resume.
 *
 * Everything is optional except the arrays, which default to empty. A resume
 * with no phone number is normal; a model that invents one is not. The point
 * of validating is to catch a malformed answer, not to demand a complete one.
 */
export const parsedProfileSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(60).default([]),
  education: z
    .array(
      z.object({
        degree: z.string().trim().max(160).optional(),
        institution: z.string().trim().max(160).optional(),
        year: z.coerce.number().int().min(1950).max(2100).optional(),
        score: z.string().trim().max(40).optional(),
      }),
    )
    .max(12)
    .default([]),
  experience: z
    .array(
      z.object({
        role: z.string().trim().max(160).optional(),
        company: z.string().trim().max(160).optional(),
        durationMonths: z.coerce.number().int().min(0).max(600).optional(),
        summary: z.string().trim().max(1000).optional(),
      }),
    )
    .max(20)
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().trim().max(160).optional(),
        summary: z.string().trim().max(1000).optional(),
        tech: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
      }),
    )
    .max(20)
    .default([]),
  certifications: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
});

/** What the model returns when scoring a student against a job. */
export const fitScoreSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  breakdown: z.object({
    skills: z.coerce.number().min(0).max(100),
    experience: z.coerce.number().min(0).max(100),
    education: z.coerce.number().min(0).max(100),
  }),
  reasoning: z.string().trim().min(10).max(1200),
});

/**
 * A fallback score can never beat a model-produced one, so the UI can trust
 * that a high score was actually reasoned about.
 */
export const FALLBACK_SCORE_CAP = 70;
