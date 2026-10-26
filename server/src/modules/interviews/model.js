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
    /*
     * No `ref` on this id, deliberately. It names a user in the auth service's
     * database, which this process has no connection to - so a `.populate()` on
     * it throws MissingSchemaError at runtime rather than failing to compile.
     * That is exactly how the admin audit screen broke after the extraction.
     */
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    notes: { type: String },
  },
  { timestamps: true },
);

interviewSchema.index({ scheduledAt: 1 });

/*
 * One live interview per application. Partial rather than plain: a plain
 * unique index would make a cancellation permanent, because the cancelled row
 * would keep the slot forever. Only `scheduled` rows are constrained, so an
 * application can be booked again after its interview is called off.
 */
interviewSchema.index(
  { applicationId: 1 },
  {
    // Named, because the field above already declares a plain applicationId
    // index and an unnamed one here would collide with it: same key pattern,
    // same generated name, different options. The two coexist happily once
    // this one has a name of its own.
    name: 'applicationId_scheduled_unique',
    unique: true,
    partialFilterExpression: { status: INTERVIEW_STATUS.SCHEDULED },
  },
);

export const Interview = mongoose.model('Interview', interviewSchema);
