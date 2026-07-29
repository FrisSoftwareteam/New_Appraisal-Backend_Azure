import mongoose, { Schema, Document } from 'mongoose';

export const ACHIEVEMENT_CATEGORIES = ['educational_qualification', 'professional_certification'] as const;
export const ACHIEVEMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];
export type AchievementStatus = (typeof ACHIEVEMENT_STATUSES)[number];

export const ACHIEVEMENT_TARGET_FIELD: Record<AchievementCategory, 'educationalQualifications' | 'professionalCertifications'> = {
  educational_qualification: 'educationalQualifications',
  professional_certification: 'professionalCertifications',
};

export interface IAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  category: AchievementCategory;
  title: string;
  issuer?: string;
  dateObtained?: Date;
  notes?: string;
  status: AchievementStatus;
  reviewedById?: mongoose.Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: ACHIEVEMENT_CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    issuer: { type: String, trim: true, maxlength: 200 },
    dateObtained: { type: Date },
    notes: { type: String, trim: true, maxlength: 600 },
    status: { type: String, enum: ACHIEVEMENT_STATUSES, required: true, default: 'pending', index: true },
    reviewedById: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String, trim: true, maxlength: 120 },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 600 },
  },
  { timestamps: true }
);

AchievementSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IAchievement>('Achievement', AchievementSchema);
