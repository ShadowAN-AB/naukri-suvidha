import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { closeRedis, redisEnabled } from './redis.js';
import { closeSockets, initSockets } from './sockets.js';

/**
 * Boot is the shortest of the four services, and the comparison is the
 * clearest evidence the extraction bought something.
 *
 * The API connects to mongo, asks whether it is a replica set member, joins
 * its Kafka consumer groups and reclaims stranded `aiTasks` before it listens.
 * This service has no database, no broker and no queue: it binds a port and
 * attaches a socket server. There is nothing here that can be slow, which is
 * why it needs no startup probe budget to speak of.
 */
async function main() {
  const app = createApp();

  // The socket server attaches to the HTTP server rather than replacing it:
  // /health has to be answerable by the same process and port, because that
  // is what the probes ask.
  const server = app.listen(env.PORT, () => {
    logger.info(`realtime service listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    if (!redisEnabled()) {
      /*
       * Repeated after listening, because this is the one way this service
       * can look completely healthy while delivering nothing. It holds every
       * socket and publishes none of its own content: with no adapter, a push
       * from the API or the notifications service has no route in. Same shape
       * as the notifications service's missing-broker warning, one layer out.
       */
      logger.warn('no REDIS_URL: this service will deliver no pushes from other processes');
    }
  });

  initSockets(server);

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    /*
     * Sockets first, deliberately.
     *
     * `server.close()` waits for connections to end, and a websocket does not
     * end on its own - it is held open by a browser tab. Closing the HTTP
     * server first would therefore wait out the grace period on every open
     * tab and then be killed. Closing the socket server disconnects the
     * clients, which is what lets the HTTP server's close callback ever run.
     * The clients reconnect to another replica, which is what the adapter and
     * a fixed replica count are for.
     */
    await closeSockets();
    server.close(async () => {
      await closeRedis();
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
