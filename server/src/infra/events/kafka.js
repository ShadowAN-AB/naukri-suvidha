import { Kafka, logLevel } from 'kafkajs';
import { ensureTopics as ensureTopicsShared, groupIdFor } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Kafka as the transport under the domain event bus.
 *
 * Optional, like Redis. Without `KAFKA_BROKERS` the bus stays in-process and
 * the portal behaves exactly as it always has - `npm run dev` is not going to
 * start a broker, and the tests must not need one either.
 *
 * What it buys, precisely: delivery survives the process. A handler that is
 * halfway through when the container dies has not committed its offset, so
 * the event is redelivered to the next one. Each named subscriber gets its
 * own consumer group, so `notifications` and `ai` both receive
 * `application.submitted` rather than competing for it.
 *
 * What it does not buy, equally precisely: the publish-side window. Producing
 * still happens after the database write, not with it, so a crash in between
 * loses the event. Closing that needs a transactional outbox, which needs
 * transactions, which need a replica set - and development runs on a
 * standalone mongod. That gap is recorded rather than papered over.
 */

let kafka = null;
let producer = null;
const consumers = [];

export function kafkaEnabled() {
  return Boolean(env.KAFKA_BROKERS);
}

function client() {
  if (!kafka) {
    kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()).filter(Boolean),
      // kafkajs logs a wall of INFO on every rebalance; warnings are the part
      // worth seeing.
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 8 },
    });
  }
  return kafka;
}

export async function startProducer() {
  if (!kafkaEnabled() || producer) return;
  producer = client().producer({ allowAutoTopicCreation: true });
  await producer.connect();
  logger.info({ brokers: env.KAFKA_BROKERS }, 'kafka producer connected');
}

/**
 * Produce, and report whether it worked.
 *
 * The earlier version of this was fire-and-forget on purpose: `publish` ran
 * inside a request that must not wait on a broker, and the business write had
 * already succeeded, so a failed produce was logged rather than turned into a
 * failed request. The cost was that nobody could tell it had happened, and
 * the event was simply gone.
 *
 * With the outbox there is finally something that can act on the answer. The
 * event is already committed, `outboxWorker` is not on anyone's request path,
 * and it can retry for as long as it takes - but only if it is told. So this
 * throws, and the two callers choose: the worker retries, and a direct
 * publish still only logs.
 */
export async function produceAndWait(event, payload) {
  if (!producer) throw new Error(`kafka producer not ready (event: ${event})`);
  await producer.send({
    topic: event,
    messages: [{ value: JSON.stringify(payload ?? {}) }],
  });
}

/**
 * Make every topic exist and have a leader before any consumer subscribes.
 *
 * The implementation is in service-kit, because the notifications service has
 * to do exactly this and the three obvious versions of it are all wrong on a
 * cold cluster - including "both services call createTopics, it is
 * idempotent", which it is not. The history is written out there.
 */
export async function ensureTopics(events) {
  if (!kafkaEnabled() || events.length === 0) return;
  await ensureTopicsShared({ admin: client().admin(), events, logger });
}

/**
 * One consumer group per named subscriber, so two modules listening to the
 * same event each get their own copy and their own offsets.
 *
 * `deliver` is the bus's wrapped handler: it already records a failure for
 * retry, so the offset is committed either way. Kafka redelivers on a crash;
 * the eventDeliveries row covers a handler that merely threw. One retry
 * mechanism per failure mode, rather than two fighting.
 */
export async function startConsumer(event, name, deliver) {
  // Derived in service-kit, because the notifications service has to arrive
  // at the same group id for the same handler name or it replays on restart.
  const groupId = groupIdFor(name);
  const consumer = client().consumer({ groupId, allowAutoTopicCreation: true });

  await consumer.connect();
  await consumer.subscribe({ topic: event, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      let payload = {};
      try {
        payload = JSON.parse(message.value?.toString() ?? '{}');
      } catch (err) {
        logger.error({ err, event, groupId }, 'unreadable kafka message; skipping');
        return;
      }
      await deliver(payload);
    },
  });

  consumers.push(consumer);
  logger.info({ event, groupId }, 'kafka consumer running');
}

export async function closeKafka() {
  await Promise.allSettled(consumers.map((c) => c.disconnect()));
  consumers.length = 0;
  if (producer) await producer.disconnect().catch(() => {});
  producer = null;
  kafka = null;
}
