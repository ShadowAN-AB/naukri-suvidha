/**
 * Barrel for the twelve collections this service owns. Importing it registers
 * every schema with mongoose, which is what the seed script and the index sync
 * rely on.
 *
 * `users` and `refreshTokens` are not here and cannot be: they belong to the
 * auth service, in its own database, and this process has no connection that
 * can reach them. The system still has fourteen collections - two of them are
 * simply somewhere else now, which is the point of step 5 rather than an
 * omission. See services/auth/src/model.js.
 */
export { Student, Company } from './modules/profiles/model.js';
export { Job } from './modules/jobs/model.js';
export { Application } from './modules/applications/model.js';
export { Resume } from './modules/resumes/model.js';
export { FitScore, AiTask } from './modules/ai/model.js';
export { Interview } from './modules/interviews/model.js';
export { Notification } from './modules/notifications/model.js';
export { AuditLog } from './modules/admin/model.js';
export { EventDelivery, OutboxEvent } from './infra/events/model.js';
