import { AppError } from './error.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../modules/auth/model.js';
import { USER_STATUS } from '../lib/constants.js';

/**
 * Verifies the access token and attaches req.user. The token's version is
 * checked against the database so a logged-out or suspended user cannot keep
 * using a token that has not expired yet.
 */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw AppError.unauthorized('Missing access token');
    }

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch (err) {
      throw AppError.unauthorized(
        err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
      );
    }

    const user = await User.findById(claims.sub).lean();
    if (!user) throw AppError.unauthorized('Account no longer exists');
    if (user.status !== USER_STATUS.ACTIVE) throw AppError.forbidden('This account is suspended');
    if ((user.tokenVersion ?? 0) !== (claims.v ?? 0)) {
      throw AppError.unauthorized('Session ended, sign in again');
    }

    req.user = { id: String(user._id), email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
