import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { aiWorker } from './modules/ai/worker.js';
import { eventRetryWorker } from './infra/events/retryWorker.js';
import { closeRedis } from './infra/redis/index.js';
import { eventBus } from './infra/events/eventBus.js';
import { closeKafka } from './infra/events/kafka.js';
import { initRealtime, closeRealtime } from './modules/realtime/index.js';
import { registerNotificationConsumers } from './modules/notifications/consumers.js';

async function main() {
  await connectDb();

  // Subscribes to the domain events and picks up anything the last process
  // left unfinished. Started before listening so no event is missed.
  registerNotificationConsumers();
  await aiWorker.start();
  // Every subscriber is registered by now, which is what the consumers are
  // built from, so the transport can only start here.
  await eventBus.startTransport();
  // Started after the consumers, so a retry has handlers to find.
  await eventRetryWorker.start();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`naukri suvidha server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Shares the HTTP server, so there is one process and one port to deploy.
  initRealtime(server);

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      eventRetryWorker.stop();
      await closeKafka();
      await closeRealtime();
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
