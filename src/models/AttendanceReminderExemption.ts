import mongoose, { Schema, Document } from 'mongoose';

/**
 * A standing opt-out from the check-in reminder email — one row per user, held
 * until an HR Admin removes it. This is deliberately *not* an attendance
 * waiver: exempt staff still appear in the daily table, the absentee reports
 * and every metric. It only suppresses the email.
 *
 * Use AttendanceException instead for anything date-bounded (leave, holidays,
 * non-working days); this collection is for people who are permanently outside
 * the check-in flow — field officers, drivers, staff without a working mailbox.
 *
 * Note: mongoose connects with autoIndex: false (see server.ts), so the unique
 * { userId } index is built explicitly by startAttendanceReminderScheduler().
 */
export interface IAttendanceReminderExemption extends Document {
  userId: mongoose.Types.ObjectId;
  userName?: string;
  email?: string;
  reason?: string;
  exemptedById: mongoose.Types.ObjectId;
  exemptedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceReminderExemptionSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalised so the admin list renders without a populate, matching AttendanceException.
    userName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 300 },
    exemptedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    exemptedByName: { type: String, required: true, trim: true, maxlength: 120 }
  },
  { timestamps: true }
);

// One exemption per user: makes "exempt this person" idempotent and lets the
// create handler turn a duplicate into a 409 rather than a second row.
AttendanceReminderExemptionSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model<IAttendanceReminderExemption>(
  'AttendanceReminderExemption',
  AttendanceReminderExemptionSchema
);
