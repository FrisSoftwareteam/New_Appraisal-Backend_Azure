import { Request, Response } from 'express';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';

// Get notifications for the current user
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await Notification.find({ userId: req.user?._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error });
  }
};

// Mark notifications as read
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, all } = req.body;

    if (all) {
      await Notification.updateMany(
        { userId: req.user?._id, isRead: false },
        { isRead: true }
      );
    } else if (ids && Array.isArray(ids)) {
      await Notification.updateMany(
        { _id: { $in: ids }, userId: req.user?._id },
        { isRead: true }
      );
    }

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating notifications', error });
  }
};

// Delete a notification
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndDelete({
      _id: id,
      userId: req.user?._id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting notification', error });
  }
};

// Create a notification (Internal helper)
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info',
  link?: string
) => {
  try {
    await Notification.create({
      userId,
      title,
      message,
      type,
      link
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};
