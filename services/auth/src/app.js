import { hostname } from 'node:os';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';

import { requestId, notFound } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { dbIsUp } from './db.js';
import { errorHandler } from './errors.js';
import routes, { internalRouter } from './routes.js';

/**
 * The auth service's HTTP surface: four public routes, two internal ones and
 * a health check.
 *
 * It is worth noticing how much is *not* here compared with the API's app.js.
 * No multer, no socket gateway, no event bus, no global rate limit - the two
 * endpoints worth limiting have their own. That is the dividend of the seam
 * being real: this process carries only what authentication needs, so it
 * starts in well under a second and its blast radius is its own.
 */
export function createApp() {
  const app = express();

  // Behind the edge in every deployment, so req.ip must come from the
  // forwarded header or both rate limiters would count the proxy's address
  // and limit the whole campus as one client.
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser());
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
   * Readiness, and the same 503-while-mongo-is-away contract the API's health
   * endpoint has, so the Kubernetes readiness probe can be pointed at it and
   * an unhealthy pod leaves the Service's endpoints without being killed.
   *
   * `instance` for the same reason as the API: under a Service, nginx reports
   * the ClusterIP on every request and genuinely cannot say which pod
   * answered, so the pod has to.
   */
  app.get('/health', (req, res) => {
    const db = dbIsUp();
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      service: 'auth',
      uptimeSeconds: Math.round(process.uptime()),
      db: db ? 'up' : 'down',
      env: env.NODE_ENV,
      instance: hostname(),
      requestId: req.id,
    });
  });

  /*
   * Mounted at the root, not at /api/auth. The edge strips the prefix, so
   * this service's own paths stay short and it can be curl'd directly without
   * reproducing the gateway's routing in your head. The one cost is that the
   * refresh cookie's Path - /api/auth, set in service-kit - is written for
   * where the browser sees this service rather than where the service sees
   * itself, which is correct and worth not "fixing".
   */
  app.use('/', routes);
  app.use('/internal', internalRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
