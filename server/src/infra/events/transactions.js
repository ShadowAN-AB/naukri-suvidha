import mongoose from 'mongoose';
import { logger } from '../../config/logger.js';

/**
 * Whether this deployment can run a multi-document transaction, and a helper
 * that uses one when it can.
 *
 * MongoDB offers transactions only on a replica set. Both the compose and
 * Kubernetes mongods run `--replSet rs0` for exactly this reason, but a
 * developer's own local mongod is almost always a standalone, and the suite
 * must keep running against it. So this is a capability, detected once, and
 * the system is correct either way:
 *
 *   - **With** transactions, the business write and the outbox row commit
 *     together, which is what closes the publish-side window.
 *   - **Without**, `withTransaction` runs the body with no session and the
 *     bus publishes straight away — exactly the behaviour that shipped
 *     before the outbox existed, window and all.
 *
 * That asymmetry is deliberate and is the same shape as Redis and Kafka being
 * optional: the portal runs with less infrastructure, and says so, rather
 * than refusing to start.
 */

let available = null;

/**
 * A replica set member reports `setName` from `hello`. A standalone does not.
 *
 * Checked by asking the server rather than by reading the connection string,
 * because `?replicaSet=rs0` in a URI pointed at a standalone would be a lie
 * and this has to be the truth.
 */
export async function detectTransactionSupport() {
  try {
    const { setName } = await mongoose.connection.db.admin().command({ hello: 1 });
    available = Boolean(setName);
  } catch (err) {
    // Treat an unanswered question as "no": falling back is always safe,
    // whereas assuming support would fail every write that used it.
    logger.warn({ err }, 'could not determine transaction support; assuming none');
    available = false;
  }

  logger.info(
    { transactions: available },
    available
      ? 'transactions available: the outbox will commit with the business write'
      : 'no transactions (standalone mongod): events publish after the write',
  );
  return available;
}

/** Null before detection has run, which callers treat as "no". */
export function transactionsAvailable() {
  return available === true;
}

/** Tests build their own connections and need the answer re-derived. */
export function resetTransactionSupport() {
  available = null;
}

/**
 * Run `fn` inside a transaction where that is possible, and plainly where it
 * is not. `fn` receives the session, or `null`.
 *
 * `session.withTransaction` retries the body on a transient error, so `fn`
 * must be safe to run more than once. In practice that means doing the writes
 * and nothing else in there — no HTTP calls, no cache writes, no socket
 * emits, all of which belong after the commit.
 */
export async function withTransaction(fn) {
  if (!transactionsAvailable()) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
