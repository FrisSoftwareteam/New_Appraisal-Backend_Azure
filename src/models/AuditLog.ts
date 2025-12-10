import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction = "create" | "update" | "delete" | "submit" | "approve" | "reject" | "comment" | "reassign";

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  details: { type: String, required: true },
  changes: { type: Map, of: new Schema({ old: Schema.Types.Mixed, new: Schema.Types.Mixed }, { _id: false }) },
  metadata: { type: Map, of: Schema.Types.Mixed },
}, { timestamps: true });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
