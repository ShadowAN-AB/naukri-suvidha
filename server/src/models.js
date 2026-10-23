/**
 * Barrel for the twelve collections. Importing this registers every schema
 * with mongoose, which is what the seed script and the index sync rely on.
 */
export { User, RefreshToken } from './modules/auth/model.js';
export { Student, Company } from './modules/profiles/model.js';
export { Job } from './modules/jobs/model.js';
export { Application } from './modules/applications/model.js';
export { Resume } from './modules/resumes/model.js';
export { FitScore, AiTask } from './modules/ai/model.js';
export { Interview } from './modules/interviews/model.js';
export { Notification } from './modules/notifications/model.js';
export { AuditLog } from './modules/admin/model.js';
