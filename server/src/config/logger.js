import pino from 'pino';
import { env, isDev } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,req,res,responseTime,reqId',
            singleLine: true,
          },
        },
      }
    : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
    ],
    remove: true,
  },
});
