import { createLogger } from '@naukri-suvidha/service-kit';
import { env, isDev } from './env.js';

// `name` so two services' lines can be told apart when they are read as one
// stream, which under compose and Kubernetes is how they are read.
export const logger = createLogger({ level: env.LOG_LEVEL, pretty: isDev, name: 'auth' });
