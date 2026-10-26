import pino from 'pino';

/**
 * One logger configuration for every service, so two processes' output can be
 * read as one stream - and, more importantly, so the redaction list below is
 * written once. A service that forgot `authorization` or `passwordHash` would
 * log credentials, and nobody reviews a log format twice.
 */
export function createLogger({ level = 'info', pretty = false, name } = {}) {
  return pino({
    level,
    ...(name ? { name } : {}),
    ...(pretty
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
}
