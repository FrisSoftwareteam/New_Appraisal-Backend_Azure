import mongoose, { Document, Schema } from 'mongoose';

export const TRAINING_ASSIGNMENT_STATUSES = [
  'assigned',
  'in_progress',
  'completed',
  'on_hold',
  'cancelled'
] as const;

export const TRAINING_DELIVERY_MODES = [
  'online',
  'in_person',
  'hybrid',
  'coaching',
  'self_study'
] as const;

export const TRAINING_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TrainingAssignmentStatus = (typeof TRAINING_ASSIGNMENT_STATUSES)[number];
export type TrainingDeliveryMode = (typeof TRAINING_DELIVERY_MODES)[number];
export type TrainingPriority = (typeof TRAINING_PRIORITIES)[number];

export interface ITrainingAssignment extends Document {
  staffId: mongoose.Types.ObjectId;
  staffName: string;
  department?: string;
  division?: string;
  grade?: string;
  title: string;
  description: string;
  provider?: string;
  deliveryMode: TrainingDeliveryMode;
  priority: TrainingPriority;
  startDate?: Date;
  dueDate?: Date;
  status: TrainingAssignmentStatus;
  progress: number;
  notes?: string;
  completionNotes?: string;
  assignedById: mongoose.Types.ObjectId;
  assignedByName: string;
  assignedAt: Date;
  completedAt?: Date;
  sourceAppraisalId?: mongoose.Types.ObjectId;
  sourcePeriod?: string;
  trainingNeededByEmployee?: string;
  trainingRecommendedByAppraiser?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingAssignmentSchema = new Schema<ITrainingAssignment>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffName: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    division: { type: String, trim: true },
    grade: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    provider: { type: String, trim: true },
    deliveryMode: {
      type: String,
      enum: TRAINING_DELIVERY_MODES,
      default: 'online'
    },
    priority: {
      type: String,
      enum: TRAINING_PRIORITIES,
      default: 'medium'
    },
    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    status: {
      type: String,
      enum: TRAINING_ASSIGNMENT_STATUSES,
      default: 'assigned',
      index: true
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    notes: { type: String, trim: true },
    completionNotes: { type: String, trim: true },
    assignedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedByName: { type: String, required: true, trim: true },
    assignedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    sourceAppraisalId: { type: Schema.Types.ObjectId, ref: 'Appraisal' },
    sourcePeriod: { type: String, trim: true },
    trainingNeededByEmployee: { type: String, trim: true },
    trainingRecommendedByAppraiser: { type: String, trim: true }
  },
  { timestamps: true }
);

TrainingAssignmentSchema.index({ staffId: 1, status: 1, dueDate: 1 });

export default mongoose.model<ITrainingAssignment>('TrainingAssignment', TrainingAssignmentSchema);
