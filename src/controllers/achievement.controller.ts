import { Response } from 'express';
import mongoose from 'mongoose';
import Achievement, {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_STATUSES,
  ACHIEVEMENT_TARGET_FIELD,
  AchievementCategory,
} from '../models/Achievement';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { createNotification } from './notification.controller';
import { notifyAchievementSubmitted, notifyAchievementReviewed } from '../services/email.service';

const HR_ROLES = ['hr_admin', 'super_admin'];

function getUserName(firstName?: string, lastName?: string, fallback?: string) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || fallback || 'Unknown User';
}

function ensureAchievementAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ message: 'Please authenticate.' });
    return false;
  }
  if (!HR_ROLES.includes(req.user.role)) {
    res.status(403).json({ message: 'Only HR Admin or Super Admin can review achievements.' });
    return false;
  }
  return true;
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  educational_qualification: 'Educational Qualification',
  professional_certification: 'Professional Certification',
};

export const createMyAchievement = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const category = req.body?.category;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const issuer = typeof req.body?.issuer === 'string' ? req.body.issuer.trim() : undefined;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;
    const dateObtained = req.body?.dateObtained ? new Date(req.body.dateObtained) : undefined;

    if (!ACHIEVEMENT_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: `category must be one of: ${ACHIEVEMENT_CATEGORIES.join(', ')}.` });
    }
    if (!title) {
      return res.status(400).json({ message: 'title is required.' });
    }

    const userName = getUserName(req.user.firstName, req.user.lastName, req.user.email);

    const item = await Achievement.create({
      userId: req.user._id,
      userName,
      category,
      title,
      issuer: issuer || undefined,
      notes: notes || undefined,
      dateObtained: dateObtained && !Number.isNaN(dateObtained.getTime()) ? dateObtained : undefined,
      status: 'pending',
    });

    const categoryLabel = CATEGORY_LABELS[category as AchievementCategory];
    const hrRecipients = await User.find({ role: { $in: HR_ROLES } }).select('email firstName lastName').lean();
    for (const hr of hrRecipients) {
      if (hr.email) {
        notifyAchievementSubmitted(
          hr.email,
          getUserName(hr.firstName, hr.lastName),
          userName,
          categoryLabel,
          title
        ).catch(() => {});
      }
      createNotification(
        String(hr._id),
        'New achievement pending verification',
        `${userName} submitted a ${categoryLabel.toLowerCase()} for review: "${title}".`,
        'info',
        '/settings/achievements'
      ).catch(() => {});
    }

    return res.status(201).json({ item });
  } catch (error) {
    console.error('Error creating achievement submission:', error);
    return res.status(500).json({ message: 'Error creating achievement submission' });
  }
};

export const getMyAchievements = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }
    const items = await Achievement.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching my achievements:', error);
    return res.status(500).json({ message: 'Error fetching achievements' });
  }
};

export const deleteMyAchievement = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid achievement id.' });
    }

    const item = await Achievement.findOne({ _id: id, userId: req.user._id });
    if (!item) {
      return res.status(404).json({ message: 'Achievement submission not found.' });
    }
    if (item.status !== 'pending') {
      return res.status(409).json({ message: `Cannot withdraw a submission that is already ${item.status}.` });
    }

    await Achievement.findByIdAndDelete(id);
    return res.json({ message: 'Achievement submission withdrawn.' });
  } catch (error) {
    console.error('Error deleting achievement submission:', error);
    return res.status(500).json({ message: 'Error deleting achievement submission' });
  }
};

export const getAchievementsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAchievementAdmin(req, res)) {
      return;
    }

    const requestedStatus = typeof req.query.status === 'string' ? req.query.status.trim() : 'pending';
    const query: Record<string, unknown> = {};
    if (requestedStatus !== 'all') {
      if (!ACHIEVEMENT_STATUSES.includes(requestedStatus as any)) {
        return res.status(400).json({ message: `status must be one of: ${ACHIEVEMENT_STATUSES.join(', ')}, all.` });
      }
      query.status = requestedStatus;
    }

    const items = await Achievement.find(query).sort({ createdAt: -1 });
    return res.json({ items });
  } catch (error) {
    console.error('Error fetching achievements for admin:', error);
    return res.status(500).json({ message: 'Error fetching achievements' });
  }
};

export const reviewAchievementForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureAchievementAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid achievement id.' });
    }

    const decision = req.body?.decision;
    if (decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ message: 'decision must be either approved or rejected.' });
    }

    const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : '';

    const item = await Achievement.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Achievement submission not found.' });
    }
    if (item.status !== 'pending') {
      return res.status(409).json({ message: `Submission is already ${item.status}.` });
    }

    if (decision === 'approved') {
      const targetField = ACHIEVEMENT_TARGET_FIELD[item.category];
      await User.findByIdAndUpdate(item.userId, { $push: { [targetField]: item.title } });
    }

    item.status = decision;
    item.reviewedById = req.user!._id;
    item.reviewedByName = getUserName(req.user!.firstName, req.user!.lastName, req.user!.email);
    item.reviewedAt = new Date();
    item.reviewNote = reviewNote || undefined;
    await item.save();

    const categoryLabel = CATEGORY_LABELS[item.category];
    const submitter = await User.findById(item.userId).select('email firstName lastName').lean();
    if (submitter?.email) {
      notifyAchievementReviewed(
        submitter.email,
        getUserName(submitter.firstName, submitter.lastName),
        categoryLabel,
        item.title,
        decision,
        item.reviewedByName,
        reviewNote || undefined
      ).catch(() => {});
    }
    createNotification(
      String(item.userId),
      decision === 'approved' ? 'Achievement verified' : 'Achievement not verified',
      decision === 'approved'
        ? `Your ${categoryLabel.toLowerCase()} "${item.title}" was verified and added to your profile.`
        : `Your ${categoryLabel.toLowerCase()} "${item.title}" was not verified.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
      decision === 'approved' ? 'success' : 'warning',
      '/profile'
    ).catch(() => {});

    return res.json({ item });
  } catch (error) {
    console.error('Error reviewing achievement submission:', error);
    return res.status(500).json({ message: 'Error reviewing achievement submission' });
  }
};
