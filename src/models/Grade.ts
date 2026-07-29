import mongoose, { Schema, Document } from 'mongoose';

export const NOTCH_COUNT = 20;

export interface IGrade extends Document {
  name: string;
  basicSalary: number;
  annualLeaveDays: number;
  holidayAllowance: number;
  notchPercentages: number[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GradeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    basicSalary: { type: Number, required: true, min: 0 },
    annualLeaveDays: { type: Number, required: true, min: 0 },
    holidayAllowance: { type: Number, required: true, min: 0, default: 0 },
    notchPercentages: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => Array.isArray(v) && v.length === NOTCH_COUNT,
        message: `notchPercentages must have exactly ${NOTCH_COUNT} entries`,
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IGrade>('Grade', GradeSchema);
