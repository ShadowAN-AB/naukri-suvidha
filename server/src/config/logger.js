import { createLogger } from '@naukri-suvidha/service-kit';
import { env, isDev } from './env.js';

// The configuration - levels, pretty printing, and above all the redaction
// list - is shared with every other service, so a credential cannot end up in
// one service's logs because its own copy of this file fell behind.
export const logger = createLogger({ level: env.LOG_LEVEL, pretty: isDev });
