import mongoose, { Document, Schema } from 'mongoose';
import { ITrainingTestQuestion, TRAINING_TEST_QUESTION_TYPES } from './TrainingTest';

export const TRAINING_TEST_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'expired'] as const;

export type TrainingTestAttemptStatus = (typeof TRAINING_TEST_ATTEMPT_STATUSES)[number];

export interface ITrainingTestAnswer {
  questionId: string;
  response: unknown;
  awardedPoints: number;
  isCorrect: boolean;
}

export interface ITrainingTestSnapshot {
  testId: mongoose.Types.ObjectId;
  name: string;
  passMark: number;
  timeLimitMinutes?: number;
  questions: ITrainingTestQuestion[];
}

export interface ITrainingTestAttempt extends Document {
  assignmentId: mongoose.Types.ObjectId;
  testId: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  staffName: string;
  attemptNumber: number;
  /**
   * The test as it stood when this attempt started. Appraisals store only a template
   * ref, so editing a live template rewrites historical results; attempts must not
   * inherit that — a graded record has to stay reproducible.
   */
  testSnapshot: ITrainingTestSnapshot;
  answers: ITrainingTestAnswer[];
  earnedPoints: number;
  totalPoints: number;
  score: number;
  passed: boolean;
  status: TrainingTestAttemptStatus;
  startedAt: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    isCorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const SnapshotQuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    type: { type: String, enum: TRAINING_TEST_QUESTION_TYPES, required: true },
    section: { type: String },
    points: { type: Number, default: 1 },
    options: { type: [SnapshotOptionSchema], default: undefined },
    acceptedAnswers: { type: [String], default: undefined },
    explanation: { type: String },
    isRequired: { type: Boolean, default: true }
  },
  { _id: false }
);

const TrainingTestAnswerSchema = new Schema<ITrainingTestAnswer>(
  {
    questionId: { type: String, required: true },
    response: { type: Schema.Types.Mixed },
    awardedPoints: { type: Number, default: 0 },
    isCorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const TrainingTestAttemptSchema = new Schema<ITrainingTestAttempt>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TrainingAssignment',
      required: true,
      index: true
    },
    testId: { type: Schema.Types.ObjectId, ref: 'TrainingTest', required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    staffName: { type: String, required: true, trim: true, maxlength: 120 },
    attemptNumber: { type: Number, required: true, min: 1 },
    testSnapshot: {
      testId: { type: Schema.Types.ObjectId, ref: 'TrainingTest', required: true },
      name: { type: String, required: true },
      passMark: { type: Number, required: true },
      timeLimitMinutes: { type: Number },
      questions: { type: [SnapshotQuestionSchema], default: [] }
    },
    answers: { type: [TrainingTestAnswerSchema], default: [] },
    earnedPoints: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    score: { type: Number, min: 0, max: 100, default: 0 },
    passed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: TRAINING_TEST_ATTEMPT_STATUSES,
      default: 'in_progress',
      index: true
    },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date }
  },
  { timestamps: true }
);

// Backs the attempt history list and the next-attempt-number lookup.
TrainingTestAttemptSchema.index({ assignmentId: 1, attemptNumber: -1 });

export default mongoose.model<ITrainingTestAttempt>(
  'TrainingTestAttempt',
  TrainingTestAttemptSchema
);
