import nodemailer from 'nodemailer';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * One SMTP transport, shared by every send.
 *
 * The pattern is Abdullah's pasted snippet, verbatim where the fields match:
 * secure=false means STARTTLS on 587, which is what Gmail serves. The
 * credentials are an app password rather than a real one, because Google
 * refuses "less-secure apps" and the two-factor requirement makes an app
 * password the only path that works unattended.
 *
 * The transport is created once and reused - nodemailer pools connections per
 * transport, so one SMTP handshake covers every email until the process ends.
 */
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

/**
 * SMTP reachability check for the health endpoint and boot warning.
 *
 * Does not block boot on failure: a transient SMTP outage must not stop the
 * service from consuming events - the failed sends land in `EmailLog` with
 * `status: 'failed'` and are visible, which is the correct behaviour.
 */
export async function verify() {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Send one message.
 *
 * The DEMO_EMAIL_OVERRIDE is applied here, in the transport, rather than in
 * the handler. The reason is coverage: an override enforced in one caller is
 * trivially bypassed by adding a second caller later, and a demo laptop that
 * silently emails real seeded addresses is the kind of mistake worth
 * engineering out. One override point, every send obeys it, the log row
 * records both what we were asked to do and what we did.
 *
 * Returns { to, originalTo, overrideApplied, messageId } rather than
 * nodemailer's raw response - the handler needs the before-and-after of the
 * override to log honestly, and nodemailer's response shape is not stable
 * across versions.
 */
export async function sendMail({ to, subject, text, html }) {
  const originalTo = to;
  const overrideApplied = Boolean(env.DEMO_EMAIL_OVERRIDE);
  const finalTo = env.DEMO_EMAIL_OVERRIDE ?? to;

  if (overrideApplied && to !== finalTo) {
    logger.info({ originalTo, overrideTo: finalTo }, 'DEMO_EMAIL_OVERRIDE rewrote recipient');
  }

  const info = await transporter.sendMail({
    from: env.MAIL_FROM,
    to: finalTo,
    subject,
    text,
    html,
  });

  return {
    to: finalTo,
    originalTo,
    overrideApplied,
    messageId: info.messageId,
  };
}

/** For tests. The default `transport.js` import is the real one; a stub can
 *  replace `sendMail` and `verify` by mocking this module instead. */
export const __test__ = { transporter };
