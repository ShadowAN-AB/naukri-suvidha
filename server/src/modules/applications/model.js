import mongoose from 'mongoose';
import { APPLICATION_STATUS, APPLICATION_STATUS_VALUES } from '../../lib/constants.js';

/** One row per status change: who moved it, when, and why. */
const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: APPLICATION_STATUS_VALUES, required: true },
    /*
     * No `ref` on this id, deliberately. It names a user in the auth service's
     * database, which this process has no connection to - so a `.populate()` on
     * it throws MissingSchemaError at runtime rather than failing to compile.
     * That is exactly how the admin audit screen broke after the extraction.
     */
    byUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
    status: {
      type: String,
      enum: APPLICATION_STATUS_VALUES,
      default: APPLICATION_STATUS.APPLIED,
    },
    fitScore: { type: Number, min: 0, max: 100 },
    appliedAt: { type: Date, default: Date.now },
    timeline: { type: [timelineEntrySchema], default: [] },
  },
  { timestamps: true },
);

// Deduplication is the database's job, not the service's.
applicationSchema.index({ jobId: 1, studentId: 1 }, { unique: true });
applicationSchema.index({ studentId: 1, appliedAt: -1 });
applicationSchema.index({ jobId: 1, fitScore: -1 });

export const Application = mongoose.model('Application', applicationSchema);
