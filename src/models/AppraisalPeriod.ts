import mongoose, { Schema, Document } from 'mongoose';

export type PeriodStatus = "draft" | "active" | "extended" | "closed";

export interface IAppraisalPeriod extends Document {
  name: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  description?: string;
  assignedEmployees: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AppraisalPeriodSchema: Schema = new Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ["draft", "active", "extended", "closed"],
    default: "draft"
  },
  description: { type: String },
  assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<IAppraisalPeriod>('AppraisalPeriod', AppraisalPeriodSchema);
