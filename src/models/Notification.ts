import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType = "info" | "warning" | "success" | "error";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  link?: string;
  createdAt: Date;
}

const NotificationSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["info", "warning", "success", "error"],
    default: "info"
  },
  isRead: { type: Boolean, default: false },
  link: { type: String },
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
