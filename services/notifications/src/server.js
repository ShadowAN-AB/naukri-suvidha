import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { connectDb, disconnectDb } from './db.js';
import { closeRedis } from './redis.js';
import { registerConsumers } from './consumers.js';
import { close as closeConsumer, kafkaEnabled, start as startConsumers } from './consumer.js';
import { eventRetryWorker } from './retryWorker.js';

/**
 * Boot order, and the one ordering constraint that matters.
 *
 * The handlers are registered before the consumers start, because the consumer
 * groups are built from the registered handlers - there is nothing to join
 * otherwise. The retry worker starts after them, so a retry has handlers to
 * find. Both are the same constraints the API's main() has, for the same
 * reasons.
 */
async function main() {
  await connectDb();

  registerConsumers();
  await startConsumers();
  await eventRetryWorker.start();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      `notifications service listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
    if (!kafkaEnabled()) {
      /*
       * Loud, and repeated after listening, because this is the one way this
       * service can look completely healthy while doing nothing at all. It is
       * a pure consumer: with no broker there is no input, so the inbox serves
       * and stays empty forever. Extracting an event-driven service is what
       * makes the broker load-bearing rather than optional - the API degrades
       * to an in-process bus, and this has no in-process publisher to listen
       * to.
       */
      logger.warn('no KAFKA_BROKERS: this service will create no notifications');
    }
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      eventRetryWorker.stop();
      await closeConsumer();
      await closeRedis();
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
