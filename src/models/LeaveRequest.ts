import mongoose, { Document, Schema } from 'mongoose';

export const LEAVE_TYPES = ['annual_leave', 'sick_leave', 'official_assignment', 'other'] as const;
export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export const APPROVAL_STEP_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

export interface IApprovalStep {
  label: string;
  approverId: mongoose.Types.ObjectId | null;
  approverName: string;
  status: ApprovalStepStatus;
  comment?: string;
  actionAt?: Date;
}

export interface ILeaveRequest extends Document {
  applicantId: mongoose.Types.ObjectId;
  applicantName: string;
  department: string;
  division: string;

  leaveType: LeaveType;
  startDateKey: string;
  endDateKey: string;
  reason: string;

  approvalSteps: IApprovalStep[];
  currentStep: number;
  status: LeaveRequestStatus;

  exceptionId?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const ApprovalStepSchema = new Schema<IApprovalStep>(
  {
    label: { type: String, required: true, trim: true },
    approverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approverName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: APPROVAL_STEP_STATUSES,
      default: 'pending',
    },
    comment: { type: String, trim: true, maxlength: 600 },
    actionAt: { type: Date },
  },
  { _id: false }
);

const LeaveRequestSchema = new Schema<ILeaveRequest>(
  {
    applicantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicantName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    division: { type: String, required: true, trim: true },

    leaveType: { type: String, enum: LEAVE_TYPES, required: true, index: true },
    startDateKey: { type: String, required: true },
    endDateKey: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },

    approvalSteps: { type: [ApprovalStepSchema], required: true },
    currentStep: { type: Number, default: 0 },
    status: {
      type: String,
      enum: LEAVE_REQUEST_STATUSES,
      default: 'pending',
      index: true,
    },

    exceptionId: { type: Schema.Types.ObjectId, ref: 'AttendanceException' },
  },
  { timestamps: true }
);

LeaveRequestSchema.index({ applicantId: 1, status: 1 });
LeaveRequestSchema.index({ 'approvalSteps.approverId': 1, status: 1 });
LeaveRequestSchema.index({ startDateKey: 1, endDateKey: 1 });

export default mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
