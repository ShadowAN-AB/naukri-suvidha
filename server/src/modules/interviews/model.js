import mongoose from 'mongoose';
import {
  INTERVIEW_MODE_VALUES,
  INTERVIEW_STATUS,
  INTERVIEW_STATUS_VALUES,
} from '../../lib/constants.js';

const interviewSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30, min: 5 },
    mode: { type: String, enum: INTERVIEW_MODE_VALUES, required: true },
    meetingLink: { type: String, trim: true },
    location: { type: String, trim: true },
    status: {
      type: String,
      enum: INTERVIEW_STATUS_VALUES,
      default: INTERVIEW_STATUS.SCHEDULED,
    },
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
  },
  { timestamps: true },
);

interviewSchema.index({ scheduledAt: 1 });

export const Interview = mongoose.model('Interview', interviewSchema);
