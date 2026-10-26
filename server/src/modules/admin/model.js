import mongoose from 'mongoose';

/**
 * Append-only. Every privileged action writes one row; nothing updates or
 * deletes them.
 */
const auditLogSchema = new mongoose.Schema(
  {
    /*
     * The actor, denormalised on purpose, and this is where the cost of a
     * service boundary actually shows up.
     *
     * This used to be `ref: 'User'` and the audit screen used `.populate()`
     * to fetch the actor's email. `users` moved to the auth service's own
     * database in step 5, and a populate cannot cross a connection - so the
     * screen started answering 500 with `MissingSchemaError: Schema hasn't
     * been registered for model "User"`, which names mongoose rather than the
     * boundary that caused it.
     *
     * Denormalising is the standard answer, not a workaround: once a
     * collection lives behind a service, data you need to *display* is copied
     * at write time instead of joined at read time. The snapshot is also more
     * correct for an audit log than a join would be - it records the email
     * the actor had when they acted, which a join to a renamed account would
     * silently lose.
     *
     * `actorId` stays, with no `ref`: it is still the identity, it is simply
     * not joinable from here. A `ref` naming a model this process does not
     * register is a loaded gun for the next person who reaches for populate.
     */
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorEmail: { type: String, trim: true },
    actorRole: { type: String },
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
