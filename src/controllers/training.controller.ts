import mongoose from 'mongoose';
import { Response } from 'express';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import TrainingAssignment, {
  TRAINING_ASSIGNMENT_STATUSES,
  TRAINING_DELIVERY_MODES,
  TRAINING_PRIORITIES,
  TrainingAssignmentStatus
} from '../models/TrainingAssignment';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  extractTrainingRecommendationSignals,
  serializeTrainingAssignment
} from '../services/training.service';

interface RecommendationRow {
  userId: string;
  userName: string;
  email?: string;
  department?: string;
  division?: string;
  grade?: string;
  sourceAppraisalId?: string;
  sourcePeriod?: string;
  trainingNeededByEmployee: string;
  trainingRecommendedByAppraiser: string;
  actionRecommended: string;
  hasRecommendation: boolean;
  activeAssignments: number;
}

const ACTIVE_TRAINING_STATUSES: TrainingAssignmentStatus[] = ['assigned', 'in_progress', 'on_hold'];

export const getTrainingRecommendationsForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const search = asString(req.query.search).toLowerCase();
    const requestedPeriod = asString(req.query.period);
    const resolvedPeriod = await resolveLatestRecommendationPeriod(requestedPeriod || undefined);

    if (!resolvedPeriod) {
      return res.json({
        period: null,
        totalRows: 0,
        filteredRows: 0,
        summary: {
          totalStaff: 0,
          withRecommendation: 0,
          withoutRecommendation: 0,
          activeAssignments: 0
        },
        rows: []
      });
    }

    const users = (await User.find({ role: { $ne: 'guest' } })
      .select('_id firstName lastName email department division grade')
      .sort({ firstName: 1, lastName: 1 })
      .lean()) as UserSnapshot[];

    if (users.length === 0) {
      return res.json({
        period: resolvedPeriod,
        totalRows: 0,
        filteredRows: 0,
        summary: {
          totalStaff: 0,
          withRecommendation: 0,
          withoutRecommendation: 0,
          activeAssignments: 0
        },
        rows: []
      });
    }

    const userIds = users.map((user) => user._id);

    const latestAppraisalRows = (await Appraisal.aggregate([
      {
        $match: {
          period: resolvedPeriod,
          employee: { $in: userIds }
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$employee',
          appraisal: {
            $first: {
              _id: '$_id',
              employee: '$employee',
              period: '$period',
              reviews: '$reviews',
              adminEditedVersion: '$adminEditedVersion'
            }
          }
        }
      }
    ])) as Array<{ _id: mongoose.Types.ObjectId; appraisal: AppraisalSnapshot }>;

    const latestAppraisalByUserId = new Map<string, AppraisalSnapshot>(
      latestAppraisalRows.map((row) => [row._id.toString(), row.appraisal])
    );

    const assignmentCounts = (await TrainingAssignment.aggregate([
      {
        $match: {
          status: { $in: ACTIVE_TRAINING_STATUSES },
          staffId: { $in: userIds }
        }
      },
      { $group: { _id: '$staffId', count: { $sum: 1 } } }
    ])) as Array<{ _id: mongoose.Types.ObjectId; count: number }>;
    const activeAssignmentsByUserId = new Map(
      assignmentCounts.map((entry) => [entry._id.toString(), entry.count])
    );

    const rows: RecommendationRow[] = users.map((user) => {
      const userId = user._id.toString();
      const userName = getUserName(user.firstName, user.lastName, user.email);
      const signals = extractTrainingRecommendationSignals(latestAppraisalByUserId.get(userId));
      const hasRecommendation = Boolean(
        signals.trainingNeededByEmployee ||
          signals.trainingRecommendedByAppraiser ||
          signals.actionRecommended
      );

      return {
        userId,
        userName,
        email: user.email,
        department: user.department ?? undefined,
        division: user.division ?? undefined,
        grade: user.grade ?? undefined,
        sourceAppraisalId: signals.sourceAppraisalId,
        sourcePeriod: signals.sourcePeriod,
        trainingNeededByEmployee: signals.trainingNeededByEmployee,
        trainingRecommendedByAppraiser: signals.trainingRecommendedByAppraiser,
        actionRecommended: signals.actionRecommended,
        hasRecommendation,
        activeAssignments: activeAssignmentsByUserId.get(userId) ?? 0
      };
    });

    const filteredRows = rows.filter((row) => {
      if (!search) {
        return true;
      }

      const searchable = [
        row.userName,
        row.email,
        row.department,
        row.division,
        row.grade,
        row.trainingNeededByEmployee,
        row.trainingRecommendedByAppraiser,
        row.actionRecommended
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(search);
    });

    const summary = {
      totalStaff: rows.length,
      withRecommendation: rows.filter((row) => row.hasRecommendation).length,
      withoutRecommendation: rows.filter((row) => !row.hasRecommendation).length,
      activeAssignments: rows.reduce((count, row) => count + row.activeAssignments, 0)
    };

    return res.json({
      period: resolvedPeriod,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      summary,
      rows: filteredRows
    });
  } catch (error) {
    console.error('Error fetching training recommendations:', error);
    return res.status(500).json({ message: 'Error fetching training recommendations', error });
  }
};

export const getTrainingAssignments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const isAdmin = isTrainingAdmin(req.user.role);
    const status = asString(req.query.status);
    const search = asString(req.query.search).toLowerCase();
    const requestedStaffId = asString(req.query.staffId);

    const filter: mongoose.FilterQuery<typeof TrainingAssignment> = {};
    if (!isAdmin) {
      filter.staffId = req.user._id;
    } else if (requestedStaffId && mongoose.Types.ObjectId.isValid(requestedStaffId)) {
      filter.staffId = new mongoose.Types.ObjectId(requestedStaffId);
    }

    if (status && isTrainingAssignmentStatus(status)) {
      filter.status = status;
    }

    const records = await TrainingAssignment.find(filter).sort({ createdAt: -1 });

    const filteredRecords = records.filter((record) => {
      if (!search) {
        return true;
      }

      const searchable = [
        record.staffName,
        record.department,
        record.division,
        record.grade,
        record.title,
        record.description,
        record.provider,
        record.trainingNeededByEmployee,
        record.trainingRecommendedByAppraiser
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(search);
    });

    const summary = {
      total: records.length,
      assigned: records.filter((record) => record.status === 'assigned').length,
      inProgress: records.filter((record) => record.status === 'in_progress').length,
      completed: records.filter((record) => record.status === 'completed').length,
      onHold: records.filter((record) => record.status === 'on_hold').length,
      cancelled: records.filter((record) => record.status === 'cancelled').length
    };

    return res.json({
      totalRows: records.length,
      filteredRows: filteredRecords.length,
      summary,
      rows: filteredRecords.map(serializeTrainingAssignment)
    });
  } catch (error) {
    console.error('Error fetching training assignments:', error);
    return res.status(500).json({ message: 'Error fetching training assignments', error });
  }
};

export const createTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const staffId = asString(req.body?.staffId);
    const title = asString(req.body?.title);
    const description = asString(req.body?.description) || title;

    if (!mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({ message: 'Valid staffId is required.' });
    }

    if (!title) {
      return res.status(400).json({ message: 'title is required.' });
    }

    if (!description) {
      return res.status(400).json({ message: 'description is required.' });
    }

    const staff = await User.findById(staffId).select(
      '_id firstName lastName email department division grade'
    );
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    const status = asString(req.body?.status);
    const requestedStatus = isTrainingAssignmentStatus(status) ? status : 'assigned';
    const deliveryMode = asString(req.body?.deliveryMode);
    const resolvedDeliveryMode = TRAINING_DELIVERY_MODES.includes(
      deliveryMode as (typeof TRAINING_DELIVERY_MODES)[number]
    )
      ? (deliveryMode as (typeof TRAINING_DELIVERY_MODES)[number])
      : 'online';
    const priority = asString(req.body?.priority);
    const resolvedPriority = TRAINING_PRIORITIES.includes(priority as (typeof TRAINING_PRIORITIES)[number])
      ? (priority as (typeof TRAINING_PRIORITIES)[number])
      : 'medium';
    const startDate = parseDate(asString(req.body?.startDate));
    const dueDate = parseDate(asString(req.body?.dueDate));

    if (startDate && dueDate && dueDate < startDate) {
      return res.status(400).json({ message: 'dueDate must be on or after startDate.' });
    }

    const sourceAppraisalId = asString(req.body?.sourceAppraisalId);
    const assignment = await TrainingAssignment.create({
      staffId: staff._id,
      staffName: getUserName(staff.firstName, staff.lastName, staff.email),
      department: staff.department,
      division: staff.division,
      grade: staff.grade,
      title,
      description,
      provider: asString(req.body?.provider) || undefined,
      deliveryMode: resolvedDeliveryMode,
      priority: resolvedPriority,
      startDate: startDate ?? undefined,
      dueDate: dueDate ?? undefined,
      status: requestedStatus,
      progress: resolveProgressByStatus(requestedStatus, toNumber(req.body?.progress)),
      notes: asString(req.body?.notes) || undefined,
      completionNotes: asString(req.body?.completionNotes) || undefined,
      assignedById: req.user!._id,
      assignedByName: getUserName(req.user?.firstName, req.user?.lastName, req.user?.email),
      assignedAt: new Date(),
      completedAt: requestedStatus === 'completed' ? new Date() : undefined,
      sourceAppraisalId: mongoose.Types.ObjectId.isValid(sourceAppraisalId)
        ? new mongoose.Types.ObjectId(sourceAppraisalId)
        : undefined,
      sourcePeriod: asString(req.body?.sourcePeriod) || undefined,
      trainingNeededByEmployee: asString(req.body?.trainingNeededByEmployee) || undefined,
      trainingRecommendedByAppraiser:
        asString(req.body?.trainingRecommendedByAppraiser) || undefined
    });

    return res.status(201).json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error creating training assignment:', error);
    return res.status(500).json({ message: 'Error creating training assignment', error });
  }
};

export const updateTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training assignment id.' });
    }

    const assignment = await TrainingAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Training assignment not found.' });
    }

    const title = asString(req.body?.title);
    const description = asString(req.body?.description);
    const provider = asString(req.body?.provider);
    const notes = asString(req.body?.notes);
    const completionNotes = asString(req.body?.completionNotes);
    const sourcePeriod = asString(req.body?.sourcePeriod);
    const trainingNeededByEmployee = asString(req.body?.trainingNeededByEmployee);
    const trainingRecommendedByAppraiser = asString(req.body?.trainingRecommendedByAppraiser);

    if (title) {
      assignment.title = title;
    }

    if (description) {
      assignment.description = description;
    }

    if (provider || req.body?.provider === '') {
      assignment.provider = provider || undefined;
    }

    const deliveryMode = asString(req.body?.deliveryMode);
    if (
      deliveryMode &&
      TRAINING_DELIVERY_MODES.includes(deliveryMode as (typeof TRAINING_DELIVERY_MODES)[number])
    ) {
      assignment.deliveryMode = deliveryMode as (typeof TRAINING_DELIVERY_MODES)[number];
    }

    const priority = asString(req.body?.priority);
    if (priority && TRAINING_PRIORITIES.includes(priority as (typeof TRAINING_PRIORITIES)[number])) {
      assignment.priority = priority as (typeof TRAINING_PRIORITIES)[number];
    }

    const startDate = parseDate(asString(req.body?.startDate));
    const dueDate = parseDate(asString(req.body?.dueDate));
    if (req.body?.startDate !== undefined) {
      assignment.startDate = startDate ?? undefined;
    }
    if (req.body?.dueDate !== undefined) {
      assignment.dueDate = dueDate ?? undefined;
    }

    if (assignment.startDate && assignment.dueDate && assignment.dueDate < assignment.startDate) {
      return res.status(400).json({ message: 'dueDate must be on or after startDate.' });
    }

    if (notes || req.body?.notes === '') {
      assignment.notes = notes || undefined;
    }
    if (completionNotes || req.body?.completionNotes === '') {
      assignment.completionNotes = completionNotes || undefined;
    }
    if (sourcePeriod || req.body?.sourcePeriod === '') {
      assignment.sourcePeriod = sourcePeriod || undefined;
    }
    if (trainingNeededByEmployee || req.body?.trainingNeededByEmployee === '') {
      assignment.trainingNeededByEmployee = trainingNeededByEmployee || undefined;
    }
    if (trainingRecommendedByAppraiser || req.body?.trainingRecommendedByAppraiser === '') {
      assignment.trainingRecommendedByAppraiser = trainingRecommendedByAppraiser || undefined;
    }

    const sourceAppraisalId = asString(req.body?.sourceAppraisalId);
    if (req.body?.sourceAppraisalId !== undefined) {
      assignment.sourceAppraisalId = mongoose.Types.ObjectId.isValid(sourceAppraisalId)
        ? new mongoose.Types.ObjectId(sourceAppraisalId)
        : undefined;
    }

    const status = asString(req.body?.status);
    if (status && isTrainingAssignmentStatus(status)) {
      assignment.status = status;
    }

    const progress = toNumber(req.body?.progress);
    assignment.progress = resolveProgressByStatus(assignment.status, progress);
    assignment.completedAt = assignment.status === 'completed' ? assignment.completedAt ?? new Date() : undefined;

    await assignment.save();
    return res.json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error updating training assignment:', error);
    return res.status(500).json({ message: 'Error updating training assignment', error });
  }
};

export const updateTrainingAssignmentStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training assignment id.' });
    }

    const assignment = await TrainingAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Training assignment not found.' });
    }

    const isAdmin = isTrainingAdmin(req.user.role);
    const isOwner = assignment.staffId.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'You can only update your own training assignments.' });
    }

    const status = asString(req.body?.status);
    if (!isTrainingAssignmentStatus(status)) {
      return res.status(400).json({ message: 'Valid status is required.' });
    }

    if (!isAdmin && ['on_hold', 'cancelled'].includes(status)) {
      return res.status(403).json({ message: 'Only HR Admin or Super Admin can pause/cancel assignments.' });
    }

    assignment.status = status;

    const progress = toNumber(req.body?.progress);
    assignment.progress = resolveProgressByStatus(status, progress);

    const completionNotes = asString(req.body?.completionNotes);
    if (completionNotes || req.body?.completionNotes === '') {
      assignment.completionNotes = completionNotes || undefined;
    }

    assignment.completedAt = status === 'completed' ? assignment.completedAt ?? new Date() : undefined;

    await assignment.save();
    return res.json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error updating training assignment status:', error);
    return res.status(500).json({ message: 'Error updating training assignment status', error });
  }
};

export const deleteTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training assignment id.' });
    }

    const assignment = await TrainingAssignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Training assignment not found.' });
    }

    await assignment.deleteOne();
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting training assignment:', error);
    return res.status(500).json({ message: 'Error deleting training assignment', error });
  }
};

function ensureTrainingAdmin(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: 'Please authenticate.' });
    return false;
  }

  if (!isTrainingAdmin(req.user.role)) {
    res.status(403).json({ message: 'Only HR Admin or Super Admin can manage training assignments.' });
    return false;
  }

  return true;
}

function isTrainingAdmin(role: string) {
  return ['hr_admin', 'super_admin'].includes(role);
}

function isTrainingAssignmentStatus(value: string): value is TrainingAssignmentStatus {
  return TRAINING_ASSIGNMENT_STATUSES.includes(value as TrainingAssignmentStatus);
}

function getUserName(firstName?: string, lastName?: string, fallback?: string) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || fallback || 'Unknown User';
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveProgressByStatus(status: TrainingAssignmentStatus, requestedProgress: number | null) {
  if (status === 'completed') {
    return 100;
  }

  if (requestedProgress !== null) {
    return Math.min(99, Math.max(0, Math.round(requestedProgress)));
  }

  if (status === 'in_progress') {
    return 50;
  }

  return 0;
}

async function resolveLatestRecommendationPeriod(requestedPeriod?: string) {
  if (requestedPeriod) {
    return requestedPeriod;
  }

  const latestConfiguredPeriod = await AppraisalPeriod.findOne({
    status: { $in: ['active', 'extended', 'closed'] }
  })
    .sort({ endDate: -1, createdAt: -1 })
    .select('name')
    .lean();

  if (latestConfiguredPeriod?.name) {
    return latestConfiguredPeriod.name;
  }

  const latestAppraisal = await Appraisal.findOne({})
    .sort({ createdAt: -1 })
    .select('period')
    .lean();

  if (typeof latestAppraisal?.period === 'string' && latestAppraisal.period.trim()) {
    return latestAppraisal.period.trim();
  }

  return null;
}

interface UserSnapshot {
  _id: mongoose.Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  division?: string;
  grade?: string;
}

interface AppraisalResponseSnapshot {
  questionId: string;
  response: unknown;
}

interface AppraisalReviewSnapshot {
  responses?: AppraisalResponseSnapshot[];
}

interface AppraisalSnapshot {
  _id: mongoose.Types.ObjectId;
  employee: mongoose.Types.ObjectId;
  period?: string;
  reviews?: AppraisalReviewSnapshot[];
  adminEditedVersion?: {
    reviews?: AppraisalReviewSnapshot[];
  };
}
