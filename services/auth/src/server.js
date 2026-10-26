import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { connectDb, disconnectDb } from './db.js';
import { closeRedis } from './redis.js';

/**
 * Boot, which is short, and that is the observable part of the extraction.
 *
 * The API's main() connects mongo, detects transaction support, registers
 * notification consumers, starts the AI worker, joins eight Kafka consumer
 * groups, starts the retry and outbox workers and only then listens. This
 * connects to a database and listens. Nothing here waits on a broker, so
 * nothing here needs a startup probe measured in tens of seconds.
 */
async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`auth service listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await closeRedis();
      await disconnectDb();
      logger.info('shutdown complete');
      process.exit(0);
    });
    // Do not let a hung connection keep the process alive forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
