import mongoose from 'mongoose';
import { PLACEMENT_STATUS, PLACEMENT_STATUS_VALUES } from '../../lib/constants.js';

const studentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    rollNo: { type: String, required: true, uppercase: true, trim: true },
    branch: { type: String, required: true, trim: true },
    batchYear: { type: Number, required: true, min: 2000, max: 2100 },
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, default: 0, min: 0 },
    skills: { type: [String], default: [] },
    currentResumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
    placementStatus: {
      type: String,
      enum: PLACEMENT_STATUS_VALUES,
      default: PLACEMENT_STATUS.UNPLACED,
      index: true,
    },
  },
  { timestamps: true },
);

studentSchema.index({ userId: 1 }, { unique: true });
studentSchema.index({ rollNo: 1 }, { unique: true });
studentSchema.index({ branch: 1, batchYear: 1 });

const companySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, trim: true },
    industry: { type: String, trim: true },
    description: { type: String, trim: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

companySchema.index({ userId: 1 }, { unique: true });

export const Student = mongoose.model('Student', studentSchema);
export const Company = mongoose.model('Company', companySchema);
