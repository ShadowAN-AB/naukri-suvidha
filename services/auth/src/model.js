import mongoose from 'mongoose';

import { userSchema, refreshTokenSchema } from './schemas.js';

/**
 * The two collections this service owns, registered on its own connection.
 *
 * The schemas live in schemas.js so that something which only wants the shape
 * - the seed script, on a second connection - can have it without this file's
 * side effect. See the note there.
 */
export const User = mongoose.model('User', userSchema);
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
