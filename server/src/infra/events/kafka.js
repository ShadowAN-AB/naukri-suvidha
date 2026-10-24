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
 * Create every topic the bus is about to use, and wait for leaders.
 *
 * `allowAutoTopicCreation` is not enough on a cold broker, and the failure is
 * an ugly one to read. A port gate - the initContainer's `nc -z kafka 9092` -
 * is satisfied the moment the broker is listening, which is well before any
 * topic exists. A consumer that subscribes then gets
 *
 *     KafkaJSProtocolError: This server does not host this topic-partition
 *
 * from the metadata request. Auto-creation *is* triggered by that very
 * request, so the topic appears a moment later and the next attempt works -
 * which is why this only ever cost one restart, on a genuinely cold cluster,
 * and why it never showed up under compose where the broker had usually been
 * running for a while.
 *
 * kafkajs marks that error `retriable: true`, so the honest response is to
 * not be in the race at all rather than to retry inside it. `waitForLeaders`
 * means this resolves when the partitions actually have a leader, so every
 * subscribe below finds a topic that is ready to serve.
 *
 * The topic names come from the registered handlers, so there is no second
 * list of events to keep in step with the first.
 */
export async function ensureTopics(events) {
  if (!kafkaEnabled() || events.length === 0) return;
  const admin = client().admin();
  try {
    await admin.connect();
    await admin.createTopics({
      topics: events.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
      waitForLeaders: true,
    });
    logger.info({ topics: events.length }, 'kafka topics ready');
  } catch (err) {
    // Not fatal. If this fails the subscribe below may still succeed via
    // auto-creation, and a broker that is genuinely unreachable is a problem
    // the consumer start will report with a better message than this would.
    logger.warn({ err }, 'could not pre-create kafka topics; relying on auto-creation');
  } finally {
    await admin.disconnect().catch(() => {});
  }
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
