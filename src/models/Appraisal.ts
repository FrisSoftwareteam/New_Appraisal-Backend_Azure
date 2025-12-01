import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from './User';
import { FlowStepStatus } from './AppraisalFlow';

export type AppraisalStatus = "not_started" | "self_review" | "in_review" | "completed" | "cancelled" | "pending_employee_review" | "in_progress";

export interface IAppraisalResponse {
  questionId: string;
  response: string | number;
  score?: number;
  comment?: string;
}

export interface IAppraisalReview {
  stepId: string; // ID from the flow step
  reviewerId: mongoose.Types.ObjectId;
  reviewerRole: UserRole;
  responses: IAppraisalResponse[];
  overallScore?: number;
  comments?: string;
  submittedAt?: Date;
  status: FlowStepStatus;
}

export interface IStepAssignment {
  stepId: string;
  assignedUser: mongoose.Types.ObjectId;
  status: FlowStepStatus;
}

export interface IAppraisal extends Document {
  employee: mongoose.Types.ObjectId;
  template: mongoose.Types.ObjectId;
  workflow: mongoose.Types.ObjectId;
  period: string;
  status: AppraisalStatus;
  currentStep: number; // Index of the current step in the workflow
  stepAssignments: IStepAssignment[];
  reviews: IAppraisalReview[];
  history: {
    action: string;
    actor: mongoose.Types.ObjectId;
    timestamp: Date;
    comment?: string;
  }[];
  overallScore?: number;
  finalComments?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppraisalResponseSchema: Schema = new Schema({
  questionId: { type: String, required: true },
  response: { type: Schema.Types.Mixed, required: true },
  score: { type: Number },
  comment: { type: String },
}, { _id: false });

const AppraisalReviewSchema: Schema = new Schema({
  stepId: { type: String, required: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewerRole: { type: String, required: true },
  responses: [AppraisalResponseSchema],
  overallScore: { type: Number },
  comments: { type: String },
  submittedAt: { type: Date },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "skipped"],
    default: "pending"
  },
}, { _id: false });

const StepAssignmentSchema: Schema = new Schema({
  stepId: { type: String, required: true },
  assignedUser: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "skipped"],
    default: "pending"
  }
}, { _id: false });

const AppraisalSchema: Schema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  template: { type: Schema.Types.ObjectId, ref: 'AppraisalTemplate', required: true },
  workflow: { type: Schema.Types.ObjectId, ref: 'AppraisalFlow', required: true },
  period: { type: String, required: true },
  status: {
    type: String,
    enum: ['setup', 'in_progress', 'completed', 'cancelled', 'pending_employee_review'],
    default: 'setup'
  },
  currentStep: { type: Number, default: 0 },
  stepAssignments: [StepAssignmentSchema],
  reviews: [AppraisalReviewSchema],
  history: [{
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    comment: { type: String }
  }],
  overallScore: { type: Number },
  finalComments: { type: String },
  rejectionReason: { type: String }, // To store the latest rejection reason for easy UI display
}, { timestamps: true });

export default mongoose.model<IAppraisal>('Appraisal', AppraisalSchema);
