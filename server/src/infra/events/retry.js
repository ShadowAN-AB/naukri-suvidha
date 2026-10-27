/*
 * The backoff and the attempt cap live in service-kit: the notifications
 * service runs the same retry logic over its own eventDeliveries collection,
 * and two curves would mean two answers to "when is this due".
 *
 * The comment that matters is there - 10s, 20s, 40s, 80s, 160s, capped inside
 * ten minutes - and so is the reason.
 */
export { MAX_DELIVERY_ATTEMPTS, backoffFrom } from '@naukri-suvidha/service-kit';
