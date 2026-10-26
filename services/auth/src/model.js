import mongoose from 'mongoose';
import { ROLE_VALUES } from '@naukri-suvidha/shared';
import { USER_STATUS, USER_STATUS_VALUES } from '@naukri-suvidha/service-kit';

/*
 * The two collections this service owns, in the one database it connects to.
 *
 * Nothing else in the system has a connection that can read them. Student and
 * Company still carry a `userId`, so the reference across the boundary is a
 * plain id and not a join - which is the trade the boundary makes: the API can
 * name a user but cannot read one, and has to ask.
 */
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



/**
 * One row per refresh token ever issued, so a token can be rotated and a
 * replay can be told apart from an ordinary expiry.
 *
 * Only the SHA-256 of the token is kept. The token itself is a JWT the client
 * holds in a cookie; a database dump should not hand anyone a working session,
 * which is the same reason a password reset token is hashed at rest.
 *
 * `familyId` is the session. Rotation issues a new row in the same family, so
 * detecting a replay anywhere in the chain is enough to revoke all of it.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /** Set when this token was exchanged for its successor. */
    usedAt: { type: Date },
    /** Set when the whole family was torn down: logout, or a replay. */
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

// Mongo prunes the rows once they can no longer verify anyway.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/*
 * The schemas are exported as well as the models.
 *
 * `mongoose.model` registers on the default connection, which is this
 * service's own. The seed script is the one thing in the repository that has
 * to write both databases - a Student carries a userId, so the users have to
 * exist and their ids have to match - and it builds its own model on a second
 * connection from these. Nothing else should; everything else asks over HTTP.
 */
export { userSchema, refreshTokenSchema };

export const User = mongoose.model('User', userSchema);
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
