import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  slug: string;
  description: string;
  accessLevel: number;
  permissions: {
    viewAppraisals: boolean;
    createAppraisals: boolean;
    reviewApprove: boolean;
    manageTemplates: boolean;
    manageUsers: boolean;
    systemSettings: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema: Schema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  accessLevel: { type: Number, required: true, default: 1 },
  permissions: {
    viewAppraisals: { type: Boolean, default: false },
    createAppraisals: { type: Boolean, default: false },
    reviewApprove: { type: Boolean, default: false },
    manageTemplates: { type: Boolean, default: false },
    manageUsers: { type: Boolean, default: false },
    systemSettings: { type: Boolean, default: false }
  }
}, { timestamps: true });

export default mongoose.model<IRole>('Role', RoleSchema);
