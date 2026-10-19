import mongoose from 'mongoose';
import { ROLE_VALUES, USER_STATUS, USER_STATUS_VALUES } from '../../lib/constants.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ROLE_VALUES, index: true },
    status: { type: String, enum: USER_STATUS_VALUES, default: USER_STATUS.ACTIVE },
    lastLoginAt: { type: Date },
    /**
     * Bumped to invalidate every access and refresh token already issued to
     * this user at once: used when an account is suspended, a password
     * changes, or a user asks to be signed out everywhere.
     */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

// The hash must never leave the process, even if a caller forgets .select().
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
