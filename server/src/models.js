/**
 * Barrel for the eleven collections this service owns. Importing it registers
 * every schema with mongoose, which is what the seed script and the index sync
 * rely on.
 *
 * Three are missing and cannot be here. `users` and `refreshTokens` belong to
 * the auth service and `notifications` to the notifications service, each in
 * its own database, and this process has no connection that can reach any of
 * them. The system still has fourteen collections; three are simply somewhere
 * else, which is the point of the extractions rather than an omission. See
 * services/auth/src/model.js and services/notifications/src/model.js.
 */
export { Student, Company } from './modules/profiles/model.js';
export { Job } from './modules/jobs/model.js';
export { Application } from './modules/applications/model.js';
export { Resume } from './modules/resumes/model.js';
export { FitScore, AiTask } from './modules/ai/model.js';
export { Interview } from './modules/interviews/model.js';
export { AuditLog } from './modules/admin/model.js';
export { EventDelivery, OutboxEvent } from './infra/events/model.js';
