import mongoose, { Document, Schema } from 'mongoose';

export const TRAINING_TEST_QUESTION_TYPES = [
  'multiple_choice',
  'multi_select',
  'true_false',
  'short_text'
] as const;

export const TRAINING_TEST_STATUSES = ['draft', 'active', 'archived'] as const;

export type TrainingTestQuestionType = (typeof TRAINING_TEST_QUESTION_TYPES)[number];
export type TrainingTestStatus = (typeof TRAINING_TEST_STATUSES)[number];

export interface ITrainingTestOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface ITrainingTestQuestion {
  id: string;
  text: string;
  type: TrainingTestQuestionType;
  section?: string;
  points: number;
  options?: ITrainingTestOption[];
  /** Accepted answers for short_text, matched case- and whitespace-insensitively. */
  acceptedAnswers?: string[];
  /** Revealed to the trainee only after the attempt is graded. */
  explanation?: string;
  isRequired: boolean;
}

export interface ITrainingTest extends Document {
  name: string;
  description?: string;
  questions: ITrainingTestQuestion[];
  /** Percentage the trainee must reach to pass. */
  passMark: number;
  /** 0 means unlimited. */
  maxAttempts: number;
  timeLimitMinutes?: number;
  shuffleQuestions: boolean;
  status: TrainingTestStatus;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingTestOptionSchema = new Schema<ITrainingTestOption>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 500 },
    isCorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const TrainingTestQuestionSchema = new Schema<ITrainingTestQuestion>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    type: { type: String, enum: TRAINING_TEST_QUESTION_TYPES, required: true },
    section: { type: String, trim: true, maxlength: 120 },
    points: { type: Number, min: 0, default: 1 },
    options: { type: [TrainingTestOptionSchema], default: undefined },
    acceptedAnswers: { type: [String], default: undefined },
    explanation: { type: String, trim: true, maxlength: 1000 },
    isRequired: { type: Boolean, default: true }
  },
  { _id: false }
);

const TrainingTestSchema = new Schema<ITrainingTest>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    questions: { type: [TrainingTestQuestionSchema], default: [] },
    passMark: { type: Number, min: 0, max: 100, default: 70 },
    maxAttempts: { type: Number, min: 0, default: 3 },
    timeLimitMinutes: { type: Number, min: 1 },
    shuffleQuestions: { type: Boolean, default: false },
    status: { type: String, enum: TRAINING_TEST_STATUSES, default: 'draft', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true, trim: true, maxlength: 120 }
  },
  { timestamps: true }
);

// Backs the test picker on the assign form, which lists active tests newest first.
TrainingTestSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model<ITrainingTest>('TrainingTest', TrainingTestSchema);
