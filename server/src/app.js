import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { dbIsUp } from './config/db.js';
import { requestId } from './middleware/requestId.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './modules/auth/routes.js';
import adminRoutes from './modules/admin/routes.js';

export function createApp() {
  const app = express();

  // Render and Vercel both sit behind a proxy; this makes req.ip truthful,
  // which the rate limiter depends on.
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
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  // A floor for the whole API. Tighter limits live on the routes that need
  // them (login is 5/min, set in Phase 2).
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (req, res) => {
    const db = dbIsUp();
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      db: db ? 'up' : 'down',
      env: env.NODE_ENV,
      requestId: req.id,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  // Module routers mount here as each phase lands:
  //   Phase 3  /api/profiles  /api/jobs
  //   Phase 4  /api/resumes   /api/applications
  //   Phase 5  /api/ai
  //   Phase 6  /api/notifications  /api/interviews  /api/admin

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
