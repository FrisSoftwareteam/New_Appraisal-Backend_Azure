import mongoose, { Schema, Document } from 'mongoose';

export const ALLOWANCE_CLAIM_ELECTIONS = ['already_claimed', 'required', 'not_required'] as const;
export type AllowanceClaimElection = (typeof ALLOWANCE_CLAIM_ELECTIONS)[number];

export interface IAllowanceClaimEvent {
  requestId: mongoose.Types.ObjectId;
  election: AllowanceClaimElection;
  amountApplied: number;
  actionedAt: Date;
}

export interface ILeaveBalance extends Document {
  userId: mongoose.Types.ObjectId;
  leaveYear: number;

  openingCarryoverDays: number;
  openingCarryoverAllowance: number;

  daysUsed: number;
  allowanceClaimed: number;
  allowanceClaimHistory: IAllowanceClaimEvent[];

  createdAt: Date;
  updatedAt: Date;
}

const AllowanceClaimEventSchema = new Schema<IAllowanceClaimEvent>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'LeaveRequest' },
    election: { type: String, enum: ALLOWANCE_CLAIM_ELECTIONS, required: true },
    amountApplied: { type: Number, required: true },
    actionedAt: { type: Date, required: true },
  },
  { _id: false }
);

const LeaveBalanceSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveYear: { type: Number, required: true },

    openingCarryoverDays: { type: Number, required: true, default: 0 },
    openingCarryoverAllowance: { type: Number, required: true, default: 0 },

    daysUsed: { type: Number, required: true, default: 0 },
    allowanceClaimed: { type: Number, required: true, default: 0 },
    allowanceClaimHistory: { type: [AllowanceClaimEventSchema], default: [] },
  },
  { timestamps: true }
);

LeaveBalanceSchema.index({ userId: 1, leaveYear: 1 }, { unique: true });

export default mongoose.model<ILeaveBalance>('LeaveBalance', LeaveBalanceSchema);
