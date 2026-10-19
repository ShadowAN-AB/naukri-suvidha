import mongoose from 'mongoose';

/**
 * Append-only. Every privileged action writes one row; nothing updates or
 * deletes them.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    ip: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ actorId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
