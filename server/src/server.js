import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { aiWorker } from './modules/ai/worker.js';

async function main() {
  await connectDb();

  // Subscribes to the domain events and picks up anything the last process
  // left unfinished. Started before listening so no event is missed.
  await aiWorker.start();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`nexus server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
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
