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
  // Committee specific fields
  isCommittee?: boolean;
  committeeMembers?: mongoose.Types.ObjectId[];
  commendations?: {
    userId: mongoose.Types.ObjectId;
    comment: string;
    submittedAt: Date;
  }[];
  changeLog?: {
    questionId: string;
    oldValue: any;
    newValue: any;
    changedBy: mongoose.Types.ObjectId;
    timestamp: Date;
  }[];
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
  // Committee Review Fields
  lockedQuestions?: {
    questionId: string;
    lockedBy: mongoose.Types.ObjectId;
    lockedAt: Date;
  }[];
  // Post-Completion Admin Editing
  adminEditedVersion?: {
    reviews: IAppraisalReview[];
    overallScore?: number;
    finalComments?: string;
    editedBy: mongoose.Types.ObjectId;
    editedAt: Date;
    editHistory: {
      editor: mongoose.Types.ObjectId;
      timestamp: Date;
      changes: {
        field: string;
        oldValue: any;
        newValue: any;
      }[];
    }[];
  };
  isAdminEdited: boolean;
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
  // Committee specific fields
  isCommittee: { type: Boolean, default: false },
  committeeMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  commendations: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    comment: { type: String },
    submittedAt: { type: Date, default: Date.now }
  }],
  changeLog: [{
    questionId: { type: String },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }]
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
  
  // Committee Review Fields
  lockedQuestions: [{
    questionId: { type: String, required: true },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lockedAt: { type: Date, default: Date.now }
  }],
  
  // Post-Completion Admin Editing
  adminEditedVersion: {
    reviews: [AppraisalReviewSchema],
    overallScore: { type: Number },
    finalComments: { type: String },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    editedAt: { type: Date },
    editHistory: [{
      editor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      timestamp: { type: Date, default: Date.now },
      changes: [{
        field: { type: String, required: true },
        oldValue: { type: Schema.Types.Mixed },
        newValue: { type: Schema.Types.Mixed }
      }]
    }]
  },
  isAdminEdited: { type: Boolean, default: false },
}, { timestamps: true });

// Add index for locking to easily find expired locks if needed
AppraisalSchema.index({ "lockedQuestions.lockedAt": 1 });

export default mongoose.model<IAppraisal>('Appraisal', AppraisalSchema);
