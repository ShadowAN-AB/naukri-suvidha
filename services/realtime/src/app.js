import { hostname } from 'node:os';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { requestId, notFound } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { errorHandler } from './errors.js';
import { redisEnabled } from './redis.js';
import { socketStats } from './sockets.js';

export function createApp() {
  const app = express();

  // Behind the edge in every deployment, so req.ip must come from the
  // forwarded header rather than being the proxy's address.
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '16kb' }));

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
   * Readiness is **always 200 while the process is listening**, and that is a
   * deliberate break from the other three services.
   *
   * They answer 503 when their database is unreachable, because a service that
   * cannot read its data cannot serve a request and should leave the Service's
   * endpoints. This one has no database. What it has is live connections, and
   * the question "should traffic come here" has only one honest answer while
   * it is accepting them.
   *
   * In particular it does **not** fail readiness when Redis is away, for the
   * same reason the notifications service does not fail on a missing broker,
   * and more sharply: pulling this pod from the Service would drop every open
   * socket on it and stop clients reconnecting, in order to signal that pushes
   * are not arriving. That trades a working channel for a broken one. The
   * degradation is reported here instead.
   */
  app.get('/health', (req, res) => {
    const sockets = socketStats();
    res.json({
      status: 'ok',
      service: 'realtime',
      uptimeSeconds: Math.round(process.uptime()),
      // No `db`: this service owns no data. Its absence is the honest answer
      // rather than a field reporting on nothing.
      sockets,
      // The one dependency that matters, and it is not optional in any
      // deployment with more than one process: every push originates
      // elsewhere and arrives through the adapter.
      push: redisEnabled() ? 'via the redis adapter' : 'unavailable (no inbound pushes)',
      identity: env.AUTH_SERVICE_URL ? 'introspected against auth' : 'bearer (signature only)',
      env: env.NODE_ENV,
      instance: hostname(),
      requestId: req.id,
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
