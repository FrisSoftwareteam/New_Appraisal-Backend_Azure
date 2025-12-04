import mongoose, { Schema, Document } from 'mongoose';

export interface IPeriodStaffAssignment extends Document {
  period: mongoose.Types.ObjectId;
  employee: mongoose.Types.ObjectId;
  workflow: mongoose.Types.ObjectId | null;
  template: mongoose.Types.ObjectId | null;
  workflowAssignedAt?: Date;
  templateAssignedAt?: Date;
  workflowAssignedBy?: mongoose.Types.ObjectId;
  templateAssignedBy?: mongoose.Types.ObjectId;
  isInitialized: boolean; // true when both workflow and template are assigned
  createdAt: Date;
  updatedAt: Date;
}

const PeriodStaffAssignmentSchema: Schema = new Schema({
  period: { type: Schema.Types.ObjectId, ref: 'AppraisalPeriod', required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workflow: { type: Schema.Types.ObjectId, ref: 'AppraisalFlow', default: null },
  template: { type: Schema.Types.ObjectId, ref: 'AppraisalTemplate', default: null },
  workflowAssignedAt: { type: Date },
  templateAssignedAt: { type: Date },
  workflowAssignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  templateAssignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isInitialized: { type: Boolean, default: false },
}, { timestamps: true });

// Compound index to ensure unique period-employee combinations
PeriodStaffAssignmentSchema.index({ period: 1, employee: 1 }, { unique: true });

// Virtual to check if assignment is complete
PeriodStaffAssignmentSchema.virtual('isComplete').get(function() {
  return this.workflow !== null && this.template !== null;
});

// Pre-save hook to update isInitialized
PeriodStaffAssignmentSchema.pre('save', function(next) {
  this.isInitialized = this.workflow !== null && this.template !== null;
  next();
});

export default mongoose.model<IPeriodStaffAssignment>('PeriodStaffAssignment', PeriodStaffAssignmentSchema);
