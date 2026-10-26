/**
 * The plumbing every service in this system shares.
 *
 * The rule for what belongs here is narrow on purpose: something goes in
 * service-kit when two services having their own copy would be a *bug*, not
 * merely a duplication.
 *
 *   tokens     an access token is minted by auth and verified by the API, so
 *              two definitions of a token are two definitions of a session
 *   errors     the one error shape, now a contract rather than a convention:
 *              the client cannot tell which service answered
 *   env        the dotenv rules that stop a test run from dropping a
 *              developer's database, and the JWT config both sides read
 *   constants  the gateway's identity header names, and the user statuses
 *              both services branch on
 *   events     the event names (which are the Kafka topics), the consumer
 *              group derivation, the retry backoff and the delivery schema -
 *              a producer and a consumer in different processes disagreeing
 *              about any of these is a silence, not an error
 *
 * Everything else - a service's own routes, models, workers, config - stays
 * in that service. This is not a place to put code that is merely convenient
 * to share; a shared library that grows without that test is how two services
 * end up unable to deploy independently, which is the whole thing being
 * bought here.
 */
export { AppError, notFound, createErrorHandler } from './errors.js';
export { createTokens, REFRESH_COOKIE, ttlSeconds, hashRefreshToken } from './tokens.js';
export { loadEnvFile, baseEnvSchema, parseEnv } from './env.js';
export { createLogger } from './logger.js';
export { requestId } from './requestId.js';
export { validate } from './validate.js';
export {
  USER_STATUS,
  USER_STATUS_VALUES,
  IDENTITY_HEADERS,
  SOCKET_EVENTS,
  roomForUser,
} from './constants.js';
export { createIdentity, requireRole } from './identity.js';
export { createRedis } from './redis.js';
export {
  EVENTS,
  EVENT_DELIVERY_STATUS,
  EVENT_DELIVERY_STATUS_VALUES,
  groupIdFor,
  MAX_DELIVERY_ATTEMPTS,
  backoffFrom,
  eventDeliverySchema,
} from './events.js';
