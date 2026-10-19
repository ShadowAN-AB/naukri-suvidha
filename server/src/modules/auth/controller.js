import * as service from './service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../lib/tokens.js';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export async function register(req, res, next) {
  try {
    const { user, profile, accessToken, refreshToken } = await service.register(req.body, req.ip);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, profile, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.login(req.body, req.ip);
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { user, accessToken } = await service.refresh(req.cookies?.[REFRESH_COOKIE]);
    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    // Clearing has to use the same attributes the cookie was set with, or the
    // browser keeps it.
    const { maxAge: _maxAge, ...options } = refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE, options);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json(await service.me(req.user.id));
  } catch (err) {
    next(err);
  }
}
