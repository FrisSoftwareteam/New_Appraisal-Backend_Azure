import mongoose, { Schema, Document } from 'mongoose';

export type CheckInStatus = 'on-time' | 'late';
export type AttendanceFlagStatus = 'clear' | 'flagged' | 'resolved';

export interface IAttendanceRecord extends Document {
  dateKey: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
  department?: string;
  checkInAt: Date;
  checkOutAt?: Date;
  checkInStatus: CheckInStatus;
  locationLabel?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  photoUrl?: string;
  photoPublicId?: string;
  checkOutPhotoUrl?: string;
  checkOutPhotoPublicId?: string;
  flagStatus: AttendanceFlagStatus;
  flagReason?: string;
  flaggedAt?: Date;
  flaggedById?: mongoose.Types.ObjectId;
  flaggedByName?: string;
  flagResolutionNote?: string;
  resolvedAt?: Date;
  resolvedById?: mongoose.Types.ObjectId;
  resolvedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceRecordSchema: Schema = new Schema(
  {
    dateKey: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    department: { type: String },
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date },
    checkInStatus: {
      type: String,
      enum: ['on-time', 'late'],
      required: true
    },
    locationLabel: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    photoUrl: { type: String },
    photoPublicId: { type: String },
    checkOutPhotoUrl: { type: String },
    checkOutPhotoPublicId: { type: String },
    flagStatus: {
      type: String,
      enum: ['clear', 'flagged', 'resolved'],
      default: 'clear',
      index: true
    },
    flagReason: { type: String },
    flaggedAt: { type: Date },
    flaggedById: { type: Schema.Types.ObjectId, ref: 'User' },
    flaggedByName: { type: String },
    flagResolutionNote: { type: String },
    resolvedAt: { type: Date },
    resolvedById: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedByName: { type: String }
  },
  { timestamps: true }
);

AttendanceRecordSchema.index({ dateKey: 1, userId: 1 }, { unique: true });
AttendanceRecordSchema.index({ userId: 1, dateKey: 1 });
AttendanceRecordSchema.index({ dateKey: 1, checkInAt: 1 });

export default mongoose.model<IAttendanceRecord>('AttendanceRecord', AttendanceRecordSchema);
