import mongoose, { Document, Schema } from 'mongoose';

export const ATTENDANCE_EXCEPTION_SCOPES = ['company', 'individual'] as const;
export const ATTENDANCE_EXCEPTION_TYPES = [
  'annual_leave',
  'casual_leave',
  'compassionate_leave',
  'maternity_leave',
  'exam_leave',
  'leave_of_absence',
  'public_holiday',
  'non_working_day',
  'other'
] as const;
export const ATTENDANCE_EXCEPTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled'
] as const;

export type AttendanceExceptionScope = (typeof ATTENDANCE_EXCEPTION_SCOPES)[number];
export type AttendanceExceptionType = (typeof ATTENDANCE_EXCEPTION_TYPES)[number];
export type AttendanceExceptionStatus = (typeof ATTENDANCE_EXCEPTION_STATUSES)[number];

export interface IAttendanceException extends Document {
  title: string;
  type: AttendanceExceptionType;
  scope: AttendanceExceptionScope;
  status: AttendanceExceptionStatus;
  startDateKey: string;
  endDateKey: string;
  userId?: mongoose.Types.ObjectId;
  userName?: string;
  notes?: string;
  createdById: mongoose.Types.ObjectId;
  createdByName: string;
  reviewedById?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceExceptionSchema = new Schema<IAttendanceException>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: ATTENDANCE_EXCEPTION_TYPES,
      required: true,
      index: true
    },
    scope: {
      type: String,
      enum: ATTENDANCE_EXCEPTION_SCOPES,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ATTENDANCE_EXCEPTION_STATUSES,
      required: true,
      default: 'pending',
      index: true
    },
    startDateKey: { type: String, required: true, index: true },
    endDateKey: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 600 },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true, trim: true, maxlength: 120 },
    reviewedById: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String, trim: true, maxlength: 120 },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 600 }
  },
  { timestamps: true }
);

AttendanceExceptionSchema.index({ startDateKey: 1, endDateKey: 1, scope: 1 });
AttendanceExceptionSchema.index({ scope: 1, userId: 1, startDateKey: 1, endDateKey: 1 });

export default mongoose.model<IAttendanceException>(
  'AttendanceException',
  AttendanceExceptionSchema
);
