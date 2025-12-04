import mongoose, { Schema, Document } from 'mongoose';

export interface IPendingStaff extends Document {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  department?: string;
  division?: string;
  unit?: string;
  grade?: string;
  jobTitle?: string;
  missingFields: string[];
  originalData: any; // Store the full original row data just in case
  createdAt: Date;
  updatedAt: Date;
}

const PendingStaffSchema: Schema = new Schema({
  email: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  role: { type: String },
  department: { type: String },
  division: { type: String },
  unit: { type: String },
  grade: { type: String },
  jobTitle: { type: String },
  missingFields: [{ type: String }],
  originalData: { type: Schema.Types.Mixed },
}, { timestamps: true });

export default mongoose.model<IPendingStaff>('PendingStaff', PendingStaffSchema);
