import mongoose from 'mongoose';
import { JOB_STATUS, JOB_STATUS_VALUES } from '../../lib/constants.js';

const jobSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    location: { type: String, trim: true },
    skillsRequired: { type: [String], default: [] },

    // Eligibility. Evaluated server-side by one shared pure function.
    minCgpa: { type: Number, default: 0, min: 0, max: 10 },
    maxBacklogs: { type: Number, default: 0, min: 0 },
    allowedBranches: { type: [String], default: [] }, // empty means every branch

    ctcLpa: { type: Number, required: true, min: 0 },
    deadline: { type: Date, required: true },

    status: {
      type: String,
      enum: JOB_STATUS_VALUES,
      default: JOB_STATUS.PENDING,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true },
);

// The student-facing list is always "approved and still open".
jobSchema.index({ status: 1, deadline: 1 });
jobSchema.index({ title: 'text', description: 'text' });

export const Job = mongoose.model('Job', jobSchema);
