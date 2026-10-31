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
import { eventRetryWorker } from './retryWorker.js';
import { verify as smtpVerify } from './transport.js';

/**
 * The email service's HTTP surface, which is one route and no others.
 *
 * There is no `/notifications`-shaped list here, because the EmailLog is an
 * operations trail rather than something a user reads. If an admin UI for it
 * is ever wanted it belongs under `/api/admin/emails` on the API, served by a
 * read model fed from the events.
 */
export function createApp() {
  const app = express();

  // Behind the edge or nothing - this service never has a client address of
  // its own to care about. The `trust proxy` is still set so forwarded headers
  // are honoured by the request logger.
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
   * Readiness answers 503 while mongo is unreachable, same as the other
   * services with a database - the EmailLog write is what makes an outcome
   * durable, so a service that cannot write it should leave the Service's
   * endpoint set rather than silently appear to work.
   *
   * SMTP and auth are reported in words rather than failing readiness, same
   * reasoning as notifications' broker and realtime's Redis - a dependency the
   * service can degrade through is visible, not fatal.
   */
  app.get('/health', async (req, res) => {
    const db = dbIsUp();
    const retries = db ? await eventRetryWorker.stats().catch(() => null) : null;

    // Verify is a round-trip, so only run it when asked. Treat a transient
    // failure as `verification failed`, which is honest without being fatal.
    let smtp = 'unavailable';
    try {
      const v = await smtpVerify();
      smtp = v.ok ? 'ready' : 'verification failed';
    } catch (err) {
      logger.warn({ err }, 'smtp verify threw');
    }

    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      service: 'email',
      uptimeSeconds: Math.round(process.uptime()),
      db: db ? 'up' : 'down',
      events: kafkaEnabled() ? 'consuming' : 'no broker configured',
      smtp,
      identity: env.AUTH_SERVICE_URL ? 'configured' : 'bearer (no auth configured)',
      overrideApplied: Boolean(env.DEMO_EMAIL_OVERRIDE),
      retries,
      env: env.NODE_ENV,
      instance: hostname(),
      requestId: req.id,
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
