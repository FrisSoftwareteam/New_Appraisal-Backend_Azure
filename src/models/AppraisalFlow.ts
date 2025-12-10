import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from './User';

export type FlowStepStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface IFlowStep {
  id?: string; // Mongoose subdocument ID
  name: string;
  rank: number;
  assignedRole: UserRole;
  assignedUsers?: mongoose.Types.ObjectId[];
  isRequired: boolean;
  dueInDays: number;
}

export interface IAppraisalFlow extends Document {
  name: string;
  description?: string;
  steps: IFlowStep[];
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FlowStepSchema: Schema = new Schema({
  name: { type: String, required: true },
  rank: { type: Number, required: true },
  assignedRole: { type: String, required: true }, // Validation against UserRole enum handled in logic or strict typing
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isRequired: { type: Boolean, default: true },
  dueInDays: { type: Number, default: 7 },
});

const AppraisalFlowSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  steps: [FlowStepSchema],
  isDefault: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<IAppraisalFlow>('AppraisalFlow', AppraisalFlowSchema);
