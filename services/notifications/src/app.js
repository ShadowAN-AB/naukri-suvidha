import { hostname } from 'node:os';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { requestId, notFound } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { dbIsUp } from './db.js';
import { errorHandler } from './errors.js';
import { kafkaEnabled } from './consumer.js';
import { redisEnabled } from './redis.js';
import { eventRetryWorker } from './retryWorker.js';
import routes from './routes.js';

export function createApp() {
  const app = express();

  // Behind the edge in every deployment, so req.ip must come from the
  // forwarded header rather than being the proxy's address.
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req) => ({ method: req.method, url: req.originalUrl ?? req.url }),
        res: (res) => ({ status: res.statusCode }),
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`,
      customErrorMessage: (req, res) =>
        `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  /**
   * Readiness, and it reports more than mongo on purpose.
   *
   * This service is only useful if it can hear events and push them onward, so
   * the broker and Redis are part of what "working" means here in a way they
   * are not for the API. Neither makes it *unready* - the inbox still serves
   * from the database, which is the half that matters - but a degraded one
   * should be visible rather than inferred from an empty notification list.
   */
  app.get('/health', async (req, res) => {
    const db = dbIsUp();
    const retries = db ? await eventRetryWorker.stats().catch(() => null) : null;

    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      service: 'notifications',
      uptimeSeconds: Math.round(process.uptime()),
      db: db ? 'up' : 'down',
      // Without a broker nothing will ever be created. Said here rather than
      // left for someone to work out from an inbox that never fills.
      events: kafkaEnabled() ? 'consuming' : 'no broker configured',
      push: redisEnabled() ? 'via the redis adapter' : 'unavailable (inbox only)',
      retries,
      env: env.NODE_ENV,
      instance: hostname(),
      requestId: req.id,
    });
  });

  // Mounted at the root: the edge strips the /api/notifications prefix, so
  // this service's own paths stay short and it can be curl'd directly.
  app.use('/', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
