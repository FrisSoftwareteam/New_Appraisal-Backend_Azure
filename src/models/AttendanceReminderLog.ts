import mongoose, { Schema, Document } from 'mongoose';

/**
 * One row per user per day, written immediately *before* the reminder email is
 * sent. The unique { dateKey, userId } index is what makes the reminder job
 * idempotent: a redeploy, an overlapping tick, or a second app instance can all
 * replay the same window without a staff member receiving two emails.
 *
 * Note: mongoose connects with autoIndex: false (see server.ts), so these
 * indexes are built explicitly by startAttendanceReminderScheduler().
 */
export interface IAttendanceReminderLog extends Document {
  dateKey: string;
  userId: mongoose.Types.ObjectId;
  email?: string;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceReminderLogSchema: Schema = new Schema(
  {
    dateKey: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, trim: true },
    sentAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

AttendanceReminderLogSchema.index({ dateKey: 1, userId: 1 }, { unique: true });
// Self-pruning: reminder logs have no value once the attendance period is closed.
AttendanceReminderLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default mongoose.model<IAttendanceReminderLog>(
  'AttendanceReminderLog',
  AttendanceReminderLogSchema
);
