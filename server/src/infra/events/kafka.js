import { Kafka, logLevel } from 'kafkajs';

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
 * Fire and forget, deliberately. `publish` is called from inside services
 * that are mid-request and must not wait on a broker; a produce that fails is
 * logged loudly rather than turned into a failed request, because the
 * business write has already succeeded by then.
 */
export function produce(event, payload) {
  if (!producer) {
    logger.warn({ event }, 'kafka producer not ready; event dropped');
    return;
  }
  producer
    .send({
      topic: event,
      messages: [{ value: JSON.stringify(payload ?? {}) }],
    })
    .catch((err) => logger.error({ err, event }, 'kafka produce failed'));
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
  const groupId = name.replace(/:/g, '.');
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
