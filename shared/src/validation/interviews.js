import { z } from 'zod';

export const INTERVIEW_MODES = Object.freeze(['online', 'onsite', 'phone']);

export const interviewScheduleSchema = z
  .object({
    applicationId: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{24}$/i, 'That does not look like a valid id'),
    scheduledAt: z.coerce.date().refine((d) => d > new Date(), 'Pick a time in the future'),
    durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
    mode: z.enum(INTERVIEW_MODES, { error: 'Choose a mode' }),
    meetingLink: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
    location: z.string().trim().max(160).optional().or(z.literal('')),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  // An online interview with no link is the most common way to waste
  // everyone's morning, so it is refused rather than warned about.
  .refine((v) => v.mode !== 'online' || Boolean(v.meetingLink), {
    message: 'An online interview needs a meeting link',
    path: ['meetingLink'],
  })
  .refine((v) => v.mode !== 'onsite' || Boolean(v.location), {
    message: 'An onsite interview needs a location',
    path: ['location'],
  });

export const interviewRescheduleSchema = z.object({
  scheduledAt: z.coerce.date().refine((d) => d > new Date(), 'Pick a time in the future'),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});
