import { z } from 'zod';
import { BRANCHES } from '../constants.js';

export const studentProfileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, 'Enter a 10-digit phone number')
    .optional()
    .or(z.literal('')),
  branch: z.enum(BRANCHES).optional(),
  batchYear: z.coerce.number().int().min(2000).max(2100).optional(),
  cgpa: z.coerce.number().min(0, 'CGPA must be 0 or more').max(10, 'CGPA must be 10 or less').optional(),
  backlogs: z.coerce.number().int().min(0, 'Cannot be negative').max(50).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(40).optional(),
});

export const companyProfileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(120).optional(),
  website: z.string().trim().url('Enter a valid URL').optional().or(z.literal('')),
  industry: z.string().trim().max(80).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});
