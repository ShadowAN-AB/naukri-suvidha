import mongoose from 'mongoose';
import {
  AI_TASK_STATUS,
  AI_TASK_STATUS_VALUES,
  AI_TASK_TYPE_VALUES,
} from '../../lib/constants.js';

const fitScoreSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    breakdown: {
      skills: { type: Number, min: 0, max: 100 },
      experience: { type: Number, min: 0, max: 100 },
      education: { type: Number, min: 0, max: 100 },
    },
    reasoning: { type: String },
    model: { type: String, required: true },
    /** True when the deterministic fallback produced this, not the model. */
    fallback: { type: Boolean, default: false },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Scoring is expensive, so it is computed once and cached per pair.
fitScoreSchema.index({ studentId: 1, jobId: 1 }, { unique: true });
fitScoreSchema.index({ jobId: 1, score: -1 });
fitScoreSchema.index({ studentId: 1, score: -1 });

const aiTaskSchema = new mongoose.Schema(
  {
    type: { type: String, enum: AI_TASK_TYPE_VALUES, required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: AI_TASK_STATUS_VALUES,
      default: AI_TASK_STATUS.QUEUED,
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

// The worker claims the oldest queued task; a dead task is never retried.
aiTaskSchema.index({ status: 1, createdAt: 1 });

export const FitScore = mongoose.model('FitScore', fitScoreSchema);
export const AiTask = mongoose.model('AiTask', aiTaskSchema);
