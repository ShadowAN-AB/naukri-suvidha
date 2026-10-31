import { EVENTS } from '@naukri-suvidha/service-kit';

import { logger } from './logger.js';
import { EmailLog } from './model.js';
import { on } from './consumer.js';
import { getUserEmail } from './identity.js';
import { sendMail } from './transport.js';
import { interviewScheduledEmail } from './templates/interviewScheduled.js';

/**
 * The one handler, on the one event the user asked for.
 *
 * `interview.scheduled` already has one consumer group - the notifications
 * service writes an inbox row from it. This one is a second, independent
 * consumer group (`email:interview-scheduled`), so both subscribers each get
 * their own copy of the event rather than competing for it. That is the
 * property one-group-per-handler is for, and it is the reason the notifications
 * extraction did not have to change when this service landed.
 *
 * The handler does five things in order:
 *   1. Short-circuit on a duplicate. Kafka is at-least-once, and the
 *      EmailLog's unique index on `eventKey` is the backstop; this read is
 *      the fast path.
 *   2. Resolve the recipient email from auth. Returns null when auth is
 *      unavailable - the handler then records a `skipped` row.
 *   3. Render the template. Pure function, no side effects.
 *   4. Send via SMTP. The transport applies DEMO_EMAIL_OVERRIDE here, not
 *      the handler.
 *   5. Write the EmailLog row with the outcome.
 *
 * On any transport failure the handler throws, which puts it on the retry
 * queue (`EventDelivery`) and the shared backoff takes over. The row written
 * for a `failed` attempt is per-event, so a retry that succeeds does not
 * leave a stale `failed` row behind.
 */
export function registerConsumers() {
  on(
    EVENTS.INTERVIEW_SCHEDULED,
    'email:interview-scheduled',
    async (payload) => {
      const { interviewId, scheduledAt, mode, jobTitle, studentUserId } = payload;

      const eventKey = `interview:${interviewId}`;

      // 1. Idempotency, cheap path. The unique index catches the race.
      const existing = await EmailLog.findOne({ eventKey }).lean();
      if (existing) {
        logger.info({ eventKey, status: existing.status }, 'duplicate event; skipping');
        return;
      }

      // 2. Resolve recipient. Null means "no auth to ask" (dev run), not
      //    "user not found" - that is also null, and in both cases the honest
      //    outcome is a skipped row rather than a send to a guessed address.
      const to = studentUserId ? await getUserEmail(studentUserId) : null;
      if (!to) {
        await EmailLog.create({
          event: EVENTS.INTERVIEW_SCHEDULED,
          eventKey,
          to: '<unresolved>',
          originalTo: '<unresolved>',
          subject: '<unresolved>',
          status: 'skipped',
          lastError: studentUserId
            ? 'auth service returned no email for this user'
            : 'event carried no studentUserId',
        });
        logger.warn({ eventKey, studentUserId }, 'no recipient; logged as skipped');
        return;
      }

      // 3. Template.
      const { subject, text, html } = interviewScheduledEmail({
        scheduledAt,
        mode,
        jobTitle,
        studentName: null, // the event does not carry it today; see docs.
      });

      // 4. Send. Any failure throws and goes to the retry queue.
      let sent;
      try {
        sent = await sendMail({ to, subject, text, html });
      } catch (err) {
        await EmailLog.create({
          event: EVENTS.INTERVIEW_SCHEDULED,
          eventKey,
          to,
          originalTo: to,
          subject,
          status: 'failed',
          lastError: String(err?.message ?? err).slice(0, 500),
        });
        // Rethrow so the retry worker picks it up on the shared backoff.
        throw err;
      }

      // 5. Log the sent row with both addresses, so the override is visible.
      await EmailLog.create({
        event: EVENTS.INTERVIEW_SCHEDULED,
        eventKey,
        to: sent.to,
        originalTo: sent.originalTo,
        overrideApplied: sent.overrideApplied,
        subject,
        status: 'sent',
        messageId: sent.messageId,
        sentAt: new Date(),
      });

      logger.info(
        { eventKey, to: sent.to, overrideApplied: sent.overrideApplied, messageId: sent.messageId },
        'email sent',
      );
    },
  );
}
