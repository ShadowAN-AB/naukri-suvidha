import { z } from 'zod';
import { BRANCHES, ROLES } from '../constants.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const baseRegister = {
  email: emailSchema,
  password: passwordSchema,
};

export const studentRegisterSchema = z.object({
  ...baseRegister,
  role: z.literal(ROLES.STUDENT),
  name: z.string().trim().min(2, 'Name is required').max(80),
  rollNo: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'Roll number is required')
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'Roll number may only contain letters and numbers'),
  branch: z.enum(BRANCHES, { error: 'Choose a branch' }),
  batchYear: z.coerce
    .number()
    .int()
    .min(2000, 'Enter a valid batch year')
    .max(2100, 'Enter a valid batch year'),
  cgpa: z.coerce.number().min(0, 'CGPA must be 0 or more').max(10, 'CGPA must be 10 or less'),
  backlogs: z.coerce.number().int().min(0, 'Backlogs cannot be negative').max(50).default(0),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, 'Enter a 10-digit phone number')
    .optional()
    .or(z.literal('')),
});

export const recruiterRegisterSchema = z.object({
  ...baseRegister,
  role: z.literal(ROLES.RECRUITER),
  companyName: z.string().trim().min(2, 'Company name is required').max(120),
  website: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
  industry: z.string().trim().max(80).optional().or(z.literal('')),
});

/**
 * Admins are not self-service: an admin account is created by seeding or by
 * another admin, never through the public register endpoint.
 */
export const registerSchema = z.discriminatedUnion('role', [
  studentRegisterSchema,
  recruiterRegisterSchema,
]);

/** Turns a ZodError into { fieldName: 'first message' } for form display. */
export function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
