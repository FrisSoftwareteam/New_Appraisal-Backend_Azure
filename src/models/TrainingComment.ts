import mongoose, { Document, Schema } from 'mongoose';

/**
 * State transitions write a row too, so the thread doubles as the assignment's
 * audit trail rather than needing a separate history array.
 */
export const TRAINING_COMMENT_KINDS = [
  'comment',
  'submission',
  'approval',
  'rejection',
  'system'
] as const;

export type TrainingCommentKind = (typeof TRAINING_COMMENT_KINDS)[number];

export interface ITrainingComment extends Document {
  assignmentId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  authorName: string;
  authorRole: string;
  body: string;
  kind: TrainingCommentKind;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingCommentSchema = new Schema<ITrainingComment>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TrainingAssignment',
      required: true,
      index: true
    },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    authorRole: { type: String, trim: true, maxlength: 60 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    kind: { type: String, enum: TRAINING_COMMENT_KINDS, default: 'comment' }
  },
  { timestamps: true }
);

// Threads are always read oldest-first for a single assignment.
TrainingCommentSchema.index({ assignmentId: 1, createdAt: 1 });

export default mongoose.model<ITrainingComment>('TrainingComment', TrainingCommentSchema);
