import mongoose, { Schema, Document } from 'mongoose';

export type PeriodStatus = "draft" | "active" | "extended" | "closed";
export type AppraisalType = "annual" | "half_year" | "quarterly" | "monthly" | "project" | "team" | "presentation";
export type PeriodType = "promotion" | "notch_increment" | "transfer" | "redeployment" | "onboarding" | "confirmation" | "regular";

export interface IAppraisalPeriod extends Document {
  name: string;
  appraisalType: AppraisalType;
  periodType: PeriodType;
  year: number;
  month?: number; // Optional, for monthly or specific periods
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
  appraisalType: {
    type: String,
    enum: ["annual", "half_year", "quarterly", "monthly", "project", "team", "presentation"],
    required: true,
    default: "annual"
  },
  periodType: {
    type: String,
    enum: ["promotion", "notch_increment", "transfer", "redeployment", "onboarding", "confirmation", "regular"],
    required: true,
    default: "regular"
  },
  year: { type: Number, required: true },
  month: { type: Number, min: 1, max: 12 }, // Optional
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
