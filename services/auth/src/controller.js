import { IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import * as service from './service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './tokens.js';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export async function register(req, res, next) {
  try {
    const { user, profile, accessToken, refreshToken } = await service.register(
      req.body,
      req.ip,
      req.id,
    );
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, profile, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.login(req.body, req.ip, req.id);
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await service.refresh(
      req.cookies?.[REFRESH_COOKIE],
    );
    // Rotation only works if the browser gets the successor.
    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    // Clearing has to use the same attributes the cookie was set with, or the
    // browser keeps it.
    const { maxAge: _maxAge, ...options } = refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE, options);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * Introspection, in the shape nginx needs.
 *
 * `auth_request` reads two things and only two things: the status code, which
 * decides whether the request proceeds, and the response *headers*, which
 * `auth_request_set` can lift out into variables. It discards the body
 * entirely.
 *
 * So the identity goes in headers for the edge, and in the body as well for
 * the API's own callers - the socket handshake introspects here directly,
 * because a Socket.IO handshake carries its token in the connection payload
 * rather than an Authorization header and so never passes through
 * `auth_request`.
 *
 * A 401 or 403 here is the gateway's answer to the client too. The error
 * shape is the shared one, so a refusal reads the same whether the edge
 * produced it or the API did.
 */
export async function introspect(req, res, next) {
  try {
    // Either header: the edge forwards the client's Authorization, and a
    // service-to-service caller may pass the token in the body instead.
    const header = req.get('authorization') ?? '';
    const [scheme, bearer] = header.split(' ');
    const token = scheme === 'Bearer' && bearer ? bearer : req.body?.token;

    const user = await service.introspect(token);

    res.set(IDENTITY_HEADERS.ID, user.id);
    res.set(IDENTITY_HEADERS.ROLE, user.role);
    res.set(IDENTITY_HEADERS.EMAIL, user.email);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/**
 * Resolve a user's email by id, for the email service.
 *
 * The handler is deliberately small: the user id comes in on the URL, the
 * service does the work, a 404 is what tells the caller "do not retry this
 * one". A 500 means the service itself failed and should be retried.
 *
 * Protected by `internalOnly` through the router mount, so the shared secret
 * is checked before this ever runs. The email service is the only caller
 * today, but the shape is a general "resolve one user by id" rather than an
 * email-specific one, because adding another consumer who needs a different
 * field is cheaper than a second lookup endpoint.
 */
export async function userEmail(req, res, next) {
  try {
    const user = await service.findUserEmail(req.params.id);
    if (!user) {
      // 404 rather than a body with `email: null`: the client's lookup is
      // over, not pending. "Do not retry" encoded in the status.
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such active user' } });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
}
