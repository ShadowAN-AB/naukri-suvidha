import mongoose from 'mongoose';
import { PARSE_STATUS, PARSE_STATUS_VALUES } from '../../lib/constants.js';

/** What the LLM is asked to return. Validated with Zod before it is written. */
const parsedProfileSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    skills: { type: [String], default: [] },
    education: [{ degree: String, institution: String, year: Number, score: String }],
    experience: [{ role: String, company: String, durationMonths: Number, summary: String }],
    projects: [{ name: String, summary: String, tech: [String] }],
    certifications: { type: [String], default: [] },
  },
  { _id: false },
);

const resumeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    version: { type: Number, required: true, min: 1 },

    storageKey: { type: String, required: true }, // opaque key for StorageProvider
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },

    extractedText: { type: String, select: false },
    parseStatus: {
      type: String,
      enum: PARSE_STATUS_VALUES,
      default: PARSE_STATUS.PENDING,
      index: true,
    },
    parsedProfile: { type: parsedProfileSchema },
    parseError: { type: String },
    parsedByModel: { type: String },
    parsedAt: { type: Date },

    /**
     * Semantic vector of the resume text. select: false because it is 768
     * floats that no ordinary query wants, and shipping it in a list response
     * would dwarf the rest of the document.
     */
    embedding: { type: [Number], select: false, default: undefined },
    embeddingModel: { type: String },
    embeddedAt: { type: Date },
  },
  { timestamps: true },
);

resumeSchema.index({ studentId: 1, version: -1 });

export const Resume = mongoose.model('Resume', resumeSchema);
