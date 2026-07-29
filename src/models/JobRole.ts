import mongoose, { Schema, Document } from 'mongoose';

export interface IJobRole extends Document {
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobRoleSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IJobRole>('JobRole', JobRoleSchema);
