import mongoose, { Schema, Document } from 'mongoose';

export type QuestionType = "rating" | "text" | "multiple_choice";

export interface IAppraisalQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text' | 'multiple_choice';
  category: string;
  weight: number;
  options?: { label: string; score: number }[];
  maxScore: number;
  isRequired: boolean;
  isScored: boolean;
}

export interface IAppraisalTemplate extends Document {
  name: string;
  description: string;
  questions: IAppraisalQuestion[];
  applicableGrades: string[];
  applicableDepartments: string[];
  assignedUsers?: mongoose.Types.ObjectId[];
  status: 'draft' | 'pending_approval' | 'active' | 'archived' | 'rejected';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AppraisalQuestionSchema: Schema = new Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  type: {
    type: String,
    enum: ["rating", "text", "multiple_choice"],
    required: true
  },
  category: { type: String, required: true },
  weight: { type: Number, default: 0 },
  options: [{
    label: { type: String },
    score: { type: Number }
  }],
  maxScore: { type: Number, default: 5 },
  isRequired: { type: Boolean, default: true },
  isScored: { type: Boolean, default: true },
});

const AppraisalTemplateSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  questions: [AppraisalQuestionSchema],
  applicableGrades: [{ type: String }],
  applicableDepartments: [{ type: String }],
  assignedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'active', 'archived', 'rejected'],
    default: 'draft'
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<IAppraisalTemplate>('AppraisalTemplate', AppraisalTemplateSchema);
