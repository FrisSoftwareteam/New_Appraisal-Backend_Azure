import mongoose, { Schema, Document } from 'mongoose';

export type UserRole =
  | "super_admin"
  | "hr_admin"
  | "hr_officer"
  | "division_head"
  | "department_head"
  | "supervisor"
  | "unit_head"
  | "coo"
  | "appraisal_committee"
  | "employee"
  | "guest";

export interface IUser extends Document {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accessLevel: number;
  department: string;
  division: string;
  unit?: string;
  grade: string;
  jobTitle?: string;
  designation?: string;
  gender?: string;
  ranking?: string;
  category?: string;
  dateConfirmed?: Date;
  dateOfLastPromotion?: Date;
  dateOfBirth?: Date;
  previousYearRating?: string;
  mdRecommendationPreviousYear?: string;
  educationalQualifications?: string[];
  professionalCertifications?: string[];
  trainingsAttended?: Array<{ title: string; year: number }>;
  careerDevelopment?: Array<{ note: string; year: number }>;
  rolesAndResponsibilities?: string;
  supervisor?: mongoose.Types.ObjectId;
  avatar?: string;
  isFirstLogin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: {
    type: String,
    enum: [
      "super_admin",
      "hr_admin",
      "hr_officer",
      "division_head",
      "department_head",
      "supervisor",
      "unit_head",
      "coo",
      "appraisal_committee",
      "employee",
      "guest"
    ],
    default: "employee"
  },
  accessLevel: { type: Number, required: true, default: 1 },
  department: { type: String, required: true },
  division: { type: String, required: true },
  unit: { type: String },
  grade: { type: String, required: true },
  jobTitle: { type: String },
  designation: { type: String },
  gender: { type: String },
  ranking: { type: String },
  category: { type: String },
  dateConfirmed: { type: Date },
  dateOfLastPromotion: { type: Date },
  dateOfBirth: { type: Date },
  previousYearRating: { type: String },
  mdRecommendationPreviousYear: { type: String },
  educationalQualifications: [{ type: String }],
  professionalCertifications: [{ type: String }],
  trainingsAttended: [{
    title: { type: String },
    year: { type: Number }
  }],
  careerDevelopment: [{
    note: { type: String },
    year: { type: Number }
  }],
  rolesAndResponsibilities: { type: String },
  supervisor: { type: Schema.Types.ObjectId, ref: 'User' },
  avatar: { type: String },
  isFirstLogin: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
