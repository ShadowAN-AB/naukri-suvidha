import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { connectDb, disconnectDb } from './db.js';
import { registerConsumers } from './consumers.js';
import { close as closeConsumer, kafkaEnabled, start as startConsumers } from './consumer.js';
import { eventRetryWorker } from './retryWorker.js';
import { verify as smtpVerify } from './transport.js';

/**
 * Boot order, same shape as notifications'.
 *
 * Handlers before consumers, because the consumer group names come from the
 * registered handlers - there is nothing to subscribe to otherwise. The retry
 * worker starts after them, so a retry can find a handler by name.
 *
 * SMTP is verified after the HTTP server is listening - the result is a loud
 * warning rather than a boot failure, because a transient SMTP outage must
 * not stop the service from accepting events into the retry queue. A send
 * that fails lands in EmailLog with status: failed, which is visible, and the
 * retry worker takes over.
 */
async function main() {
  await connectDb();

  registerConsumers();
  await startConsumers();
  await eventRetryWorker.start();

  const app = createApp();
  const server = app.listen(env.PORT, async () => {
    logger.info(`email service listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);

    if (!kafkaEnabled()) {
      /*
       * Same shape of warning as notifications'. A pure consumer with no
       * broker configured hears no events, so the whole service does nothing
       * except serve its /health endpoint - which is the kind of failure
       * worth being loud about.
       */
      logger.warn('no KAFKA_BROKERS: this service will send no emails');
    }

    if (!env.AUTH_SERVICE_URL) {
      /*
       * In a dev run without the auth service, every send lands as `skipped`
       * because there is no email to resolve. The service still boots, so a
       * laptop can see the architecture come together even without auth; the
       * handler's `skipped` row is what makes the degradation visible.
       */
      logger.warn('no AUTH_SERVICE_URL: email lookups will skip');
    }

    const v = await smtpVerify();
    if (!v.ok) {
      logger.warn({ error: v.error }, 'SMTP verification failed; sends will fail until it recovers');
    } else {
      logger.info('SMTP ready');
    }
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      eventRetryWorker.stop();
      await closeConsumer();
      await disconnectDb();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
