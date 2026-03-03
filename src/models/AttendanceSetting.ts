import mongoose, { Schema, Document } from 'mongoose';

export interface IAttendanceSetting extends Document {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSettingSchema: Schema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model<IAttendanceSetting>('AttendanceSetting', AttendanceSettingSchema);
