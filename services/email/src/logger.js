import { createLogger } from '@naukri-suvidha/service-kit';
import { env, isDev } from './env.js';

export const logger = createLogger({ level: env.LOG_LEVEL, pretty: isDev, name: 'email' });
