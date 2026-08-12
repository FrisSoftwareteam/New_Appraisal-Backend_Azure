import mongoose from 'mongoose';
import { Response } from 'express';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import { getLastRelevantPeriodFilter } from '../utils/period-utils';
import TrainingAssignment, {
  ITrainingAssignment,
  TRAINING_ASSIGNMENT_STATUSES,
  TRAINING_DELIVERY_MODES,
  TRAINING_PRIORITIES,
  TrainingAssignmentStatus
} from '../models/TrainingAssignment';
import TrainingComment from '../models/TrainingComment';
import TrainingTest from '../models/TrainingTest';
import User, { IUser } from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  AppraisalSnapshot as SharedAppraisalSnapshot,
  extractTrainingRecommendationSignals,
  getTrainingSignalMap,
  hasAnyTrainingSignal,
  isTrainingAdminRole,
  resolveAssignmentAccess,
  serializeTrainingAssignment
} from '../services/training.service';
import { createNotification } from './notification.controller';
import { createAuditLog } from './audit.controller';
import {
  notifyTrainingApproved,
  notifyTrainingAssigned,
  notifyTrainingComment,
  notifyTrainingRejected,
  notifyTrainingSubmittedForReview
} from '../services/email.service';

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
    const department = asString(req.query.department);
    const division = asString(req.query.division);
    const grade = asString(req.query.grade);
    const hasRecommendationFilter = asString(req.query.hasRecommendation);
    const page = Math.max(1, toNumber(req.query.page) ?? 1);
    const limit = Math.min(200, Math.max(1, toNumber(req.query.limit) ?? 50));

    // Offered to the UI so HR can pick a period rather than being stuck with
    // whichever one resolveLatestRecommendationPeriod happens to guess.
    const availablePeriods = await listAvailablePeriods();
    const resolvedPeriod = await resolveRecommendationPeriod(requestedPeriod || undefined);

    const emptyPayload = {
      period: resolvedPeriod,
      availablePeriods,
      page,
      limit,
      totalRows: 0,
      filteredRows: 0,
      summary: {
        totalStaff: 0,
        withRecommendation: 0,
        withoutRecommendation: 0,
        activeAssignments: 0
      },
      rows: []
    };

    if (!resolvedPeriod) {
      return res.json({ ...emptyPayload, period: null });
    }

    // Structural filters go into the query rather than a post-hoc JS filter so we
    // are not pulling every non-guest user into memory to discard most of them.
    const userQuery: mongoose.FilterQuery<IUser> = { role: { $ne: 'guest' } };
    if (department && !isAllToken(department)) userQuery.department = department;
    if (division && !isAllToken(division)) userQuery.division = division;
    if (grade && !isAllToken(grade)) userQuery.grade = grade;

    const users = (await User.find(userQuery)
      .select('_id firstName lastName email department division grade')
      .sort({ firstName: 1, lastName: 1 })
      .lean()) as UserSnapshot[];

    if (users.length === 0) {
      return res.json(emptyPayload);
    }

    const userIds = users.map((user) => user._id);
    const signalMap = await getTrainingSignalMap();

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
      const signals = extractTrainingRecommendationSignals(
        latestAppraisalByUserId.get(userId),
        signalMap
      );
      const hasRecommendation = hasAnyTrainingSignal(signals);

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
      if (hasRecommendationFilter === 'true' && !row.hasRecommendation) {
        return false;
      }
      if (hasRecommendationFilter === 'false' && row.hasRecommendation) {
        return false;
      }

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

    // Computed over the filtered set: metric cards that ignore the active filters
    // read as a bug, not as a feature.
    const summary = {
      totalStaff: filteredRows.length,
      withRecommendation: filteredRows.filter((row) => row.hasRecommendation).length,
      withoutRecommendation: filteredRows.filter((row) => !row.hasRecommendation).length,
      activeAssignments: filteredRows.reduce((count, row) => count + row.activeAssignments, 0)
    };

    const pagedRows = filteredRows.slice((page - 1) * limit, page * limit);

    return res.json({
      period: resolvedPeriod,
      availablePeriods,
      page,
      limit,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      summary,
      rows: pagedRows
    });
  } catch (error) {
    console.error('Error fetching training recommendations:', error);
    return res.status(500).json({ message: 'Error fetching training recommendations', error });
  }
};

/**
 * Per-staff drill-down: every period that produced a training signal for one person,
 * plus their assignment history. The list endpoint only ever shows one period, which
 * made older recommendations effectively unreachable.
 */
export const getStaffTrainingSignals = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid staff id.' });
    }

    const staff = await User.findById(userId)
      .select('_id firstName lastName email department division grade supervisor')
      .populate('supervisor', 'firstName lastName email role')
      .lean();

    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    const signalMap = await getTrainingSignalMap();

    const appraisals = (await Appraisal.find({ employee: staff._id })
      .select('_id period status createdAt reviews adminEditedVersion')
      .sort({ createdAt: -1 })
      .lean()) as unknown as Array<SharedAppraisalSnapshot & { status?: string }>;

    const signals = appraisals
      .map((appraisal) => {
        const extracted = extractTrainingRecommendationSignals(appraisal, signalMap);
        return {
          period: appraisal.period ?? '',
          sourceAppraisalId: extracted.sourceAppraisalId,
          appraisalStatus: appraisal.status,
          createdAt:
            appraisal.createdAt instanceof Date
              ? appraisal.createdAt.toISOString()
              : appraisal.createdAt,
          trainingNeededByEmployee: extracted.trainingNeededByEmployee,
          trainingRecommendedByAppraiser: extracted.trainingRecommendedByAppraiser,
          actionRecommended: extracted.actionRecommended,
          hasRecommendation: hasAnyTrainingSignal(extracted)
        };
      })
      .filter((entry) => entry.hasRecommendation);

    const assignments = await TrainingAssignment.find({ staffId: staff._id }).sort({
      createdAt: -1
    });

    const supervisor = staff.supervisor as unknown as
      | { _id: mongoose.Types.ObjectId; firstName?: string; lastName?: string; email?: string; role?: string }
      | undefined;

    return res.json({
      staff: {
        id: staff._id.toString(),
        name: getUserName(staff.firstName, staff.lastName, staff.email),
        email: staff.email,
        department: staff.department,
        division: staff.division,
        grade: staff.grade,
        supervisor: supervisor?._id
          ? {
              userId: supervisor._id.toString(),
              name: getUserName(supervisor.firstName, supervisor.lastName, supervisor.email),
              role: supervisor.role
            }
          : undefined
      },
      signals,
      assignments: assignments.map(serializeTrainingAssignment)
    });
  } catch (error) {
    console.error('Error fetching staff training signals:', error);
    return res.status(500).json({ message: 'Error fetching staff training signals', error });
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
    const needsMyApproval = asString(req.query.needsMyApproval) === 'true';

    const filter: mongoose.FilterQuery<typeof TrainingAssignment> = {};

    if (needsMyApproval) {
      // Reviewers who are not HR admins still need a way to find their queue.
      filter.status = 'pending_review';
      filter['reviewers.userId'] = req.user._id;
    } else if (!isAdmin) {
      filter.staffId = req.user._id;
    } else if (requestedStaffId && mongoose.Types.ObjectId.isValid(requestedStaffId)) {
      filter.staffId = new mongoose.Types.ObjectId(requestedStaffId);
    }

    if (!needsMyApproval && status && isTrainingAssignmentStatus(status)) {
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
      pendingReview: records.filter((record) => record.status === 'pending_review').length,
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
      '_id firstName lastName email department division grade supervisor'
    );
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    const requestedTestId = asString(req.body?.testId);
    let test = null;
    if (requestedTestId) {
      if (!mongoose.Types.ObjectId.isValid(requestedTestId)) {
        return res.status(400).json({ message: 'Invalid testId.' });
      }
      test = await TrainingTest.findById(requestedTestId).select('_id name status questions');
      if (!test) {
        return res.status(404).json({ message: 'Training test not found.' });
      }
      if (test.status !== 'active') {
        return res.status(400).json({ message: 'Only an active test can be attached to an assignment.' });
      }
      if ((test.questions ?? []).length === 0) {
        return res.status(400).json({ message: 'The selected test has no questions.' });
      }
    }

    const reviewers = await resolveReviewers(req.body?.reviewers, staff, req.user!);

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
        asString(req.body?.trainingRecommendedByAppraiser) || undefined,
      testId: test?._id,
      testRequired: Boolean(test),
      testAttemptsUsed: 0,
      testWaived: false,
      reviewers
    });

    notifyStaffAssigned(assignment, staff, Boolean(test)).catch(() => {});

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

    if (req.body?.testId !== undefined) {
      const requestedTestId = asString(req.body?.testId);
      if (!requestedTestId) {
        assignment.testId = undefined;
        assignment.testRequired = false;
      } else {
        if (!mongoose.Types.ObjectId.isValid(requestedTestId)) {
          return res.status(400).json({ message: 'Invalid testId.' });
        }
        const test = await TrainingTest.findById(requestedTestId).select('_id status questions');
        if (!test) {
          return res.status(404).json({ message: 'Training test not found.' });
        }
        if (test.status !== 'active') {
          return res
            .status(400)
            .json({ message: 'Only an active test can be attached to an assignment.' });
        }
        assignment.testId = test._id as mongoose.Types.ObjectId;
        assignment.testRequired = true;
      }
    }

    if (req.body?.reviewers !== undefined) {
      const staff = await User.findById(assignment.staffId).select(
        '_id firstName lastName email supervisor'
      );
      if (staff) {
        assignment.reviewers = await resolveReviewers(req.body?.reviewers, staff, req.user!);
      }
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

export const getTrainingAssignmentById = async (req: AuthRequest, res: Response) => {
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

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.canView) {
      return res.status(403).json({ message: 'You do not have access to this training assignment.' });
    }

    let test = null;
    if (assignment.testId) {
      const testDoc = await TrainingTest.findById(assignment.testId)
        .select('_id name description passMark maxAttempts timeLimitMinutes questions status')
        .lean();
      if (testDoc) {
        // Metadata only — never the questions, which carry the answer key.
        test = {
          id: testDoc._id.toString(),
          name: testDoc.name,
          description: testDoc.description,
          passMark: testDoc.passMark,
          maxAttempts: testDoc.maxAttempts,
          timeLimitMinutes: testDoc.timeLimitMinutes,
          questionCount: (testDoc.questions ?? []).length,
          status: testDoc.status
        };
      }
    }

    return res.json({
      item: serializeTrainingAssignment(assignment),
      test,
      access: {
        isOwner: access.isOwner,
        isReviewer: access.isReviewer,
        isAdmin: access.isAdmin,
        canComment: access.canComment,
        canApprove: access.canApprove
      }
    });
  } catch (error) {
    console.error('Error fetching training assignment:', error);
    return res.status(500).json({ message: 'Error fetching training assignment', error });
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

    // Completion is no longer self-declared: staff go through submit -> approve so
    // there is a reviewer and a comment trail behind every completed training.
    if (!isAdmin && ['pending_review', 'completed'].includes(status)) {
      return res.status(403).json({
        message:
          'Submit the training for approval instead of marking it complete directly.'
      });
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

/** Trainee hands the training over for sign-off. Blocked until the test is satisfied. */
export const submitTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignmentForRequest(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.isOwner && !access.isAdmin) {
      return res
        .status(403)
        .json({ message: 'Only the assigned staff member can submit this training.' });
    }

    if (['completed', 'cancelled'].includes(assignment.status)) {
      return res
        .status(409)
        .json({ message: `This training is already ${assignment.status.replace('_', ' ')}.` });
    }

    if (assignment.status === 'pending_review') {
      return res.status(409).json({ message: 'This training is already awaiting approval.' });
    }

    const gate = describeTestGate(assignment);
    if (!gate.satisfied) {
      return res.status(400).json({ message: gate.reason });
    }

    const note = asString(req.body?.completionNotes || req.body?.note);

    assignment.status = 'pending_review';
    assignment.progress = resolveProgressByStatus('pending_review', null);
    assignment.submittedForReviewAt = new Date();
    assignment.rejectionReason = undefined;
    if (note) {
      assignment.completionNotes = note;
    }
    await assignment.save();

    await TrainingComment.create({
      assignmentId: assignment._id,
      authorId: req.user._id,
      authorName: getUserName(req.user.firstName, req.user.lastName, req.user.email),
      authorRole: req.user.role,
      body: note || 'Submitted this training for approval.',
      kind: 'submission'
    });

    notifyReviewersOfSubmission(assignment, note).catch(() => {});

    return res.json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error submitting training assignment:', error);
    return res.status(500).json({ message: 'Error submitting training assignment', error });
  }
};

export const approveTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignmentForRequest(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.canApprove) {
      return res
        .status(403)
        .json({ message: 'Only an assigned reviewer or a training admin can approve this training.' });
    }

    if (assignment.status === 'completed') {
      return res.status(409).json({ message: 'This training is already completed.' });
    }

    if (assignment.status !== 'pending_review') {
      return res
        .status(409)
        .json({ message: 'This training has not been submitted for approval yet.' });
    }

    const note = asString(req.body?.note);
    const approverName = getUserName(req.user.firstName, req.user.lastName, req.user.email);

    assignment.status = 'completed';
    assignment.progress = 100;
    assignment.completedAt = new Date();
    assignment.approvedById = req.user._id as mongoose.Types.ObjectId;
    assignment.approvedByName = approverName;
    assignment.approvedAt = new Date();
    assignment.rejectionReason = undefined;
    await assignment.save();

    await TrainingComment.create({
      assignmentId: assignment._id,
      authorId: req.user._id,
      authorName: approverName,
      authorRole: req.user.role,
      body: note || 'Approved this training as complete.',
      kind: 'approval'
    });

    await createAuditLog(
      req.user._id.toString(),
      'training_approved',
      'TrainingAssignment',
      (assignment._id as mongoose.Types.ObjectId).toString(),
      `Approved training "${assignment.title}" for ${assignment.staffName}`
    );

    notifyTraineeOfDecision(assignment, 'approved', approverName, note).catch(() => {});

    return res.json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error approving training assignment:', error);
    return res.status(500).json({ message: 'Error approving training assignment', error });
  }
};

export const rejectTrainingAssignment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignmentForRequest(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.canApprove) {
      return res.status(403).json({
        message: 'Only an assigned reviewer or a training admin can request changes on this training.'
      });
    }

    if (assignment.status !== 'pending_review') {
      return res
        .status(409)
        .json({ message: 'This training has not been submitted for approval yet.' });
    }

    const reason = asString(req.body?.reason);
    if (!reason) {
      return res.status(400).json({ message: 'A reason is required when requesting changes.' });
    }

    const reviewerName = getUserName(req.user.firstName, req.user.lastName, req.user.email);

    assignment.status = 'in_progress';
    assignment.progress = resolveProgressByStatus('in_progress', null);
    assignment.submittedForReviewAt = undefined;
    assignment.rejectionReason = reason;
    await assignment.save();

    await TrainingComment.create({
      assignmentId: assignment._id,
      authorId: req.user._id,
      authorName: reviewerName,
      authorRole: req.user.role,
      body: reason,
      kind: 'rejection'
    });

    await createAuditLog(
      req.user._id.toString(),
      'training_changes_requested',
      'TrainingAssignment',
      (assignment._id as mongoose.Types.ObjectId).toString(),
      `Requested changes on training "${assignment.title}" for ${assignment.staffName}`
    );

    notifyTraineeOfDecision(assignment, 'rejected', reviewerName, reason).catch(() => {});

    return res.json({ item: serializeTrainingAssignment(assignment) });
  } catch (error) {
    console.error('Error rejecting training assignment:', error);
    return res.status(500).json({ message: 'Error rejecting training assignment', error });
  }
};

export const getTrainingAssignmentComments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignmentForRequest(req, res);
    if (!assignment) {
      return;
    }

    if (!resolveAssignmentAccess(req.user, assignment).canView) {
      return res.status(403).json({ message: 'You do not have access to this training assignment.' });
    }

    const comments = await TrainingComment.find({ assignmentId: assignment._id }).sort({
      createdAt: 1
    });

    return res.json({
      items: comments.map((comment) => ({
        id: (comment._id as mongoose.Types.ObjectId).toString(),
        assignmentId: comment.assignmentId.toString(),
        authorId: comment.authorId.toString(),
        authorName: comment.authorName,
        authorRole: comment.authorRole,
        body: comment.body,
        kind: comment.kind,
        createdAt: comment.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching training comments:', error);
    return res.status(500).json({ message: 'Error fetching training comments', error });
  }
};

export const createTrainingAssignmentComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignmentForRequest(req, res);
    if (!assignment) {
      return;
    }

    if (!resolveAssignmentAccess(req.user, assignment).canComment) {
      return res.status(403).json({ message: 'You do not have access to this training assignment.' });
    }

    const body = asString(req.body?.body);
    if (!body) {
      return res.status(400).json({ message: 'Comment body is required.' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ message: 'Comment must be 2000 characters or fewer.' });
    }

    const authorName = getUserName(req.user.firstName, req.user.lastName, req.user.email);
    const comment = await TrainingComment.create({
      assignmentId: assignment._id,
      authorId: req.user._id,
      authorName,
      authorRole: req.user.role,
      body,
      kind: 'comment'
    });

    notifyParticipantsOfComment(assignment, req.user, authorName, body).catch(() => {});

    return res.status(201).json({
      item: {
        id: (comment._id as mongoose.Types.ObjectId).toString(),
        assignmentId: comment.assignmentId.toString(),
        authorId: comment.authorId.toString(),
        authorName: comment.authorName,
        authorRole: comment.authorRole,
        body: comment.body,
        kind: comment.kind,
        createdAt: comment.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating training comment:', error);
    return res.status(500).json({ message: 'Error creating training comment', error });
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

    await TrainingComment.deleteMany({ assignmentId: assignment._id });
    await assignment.deleteOne();

    await createAuditLog(
      req.user!._id.toString(),
      'training_deleted',
      'TrainingAssignment',
      id,
      `Deleted training "${assignment.title}" for ${assignment.staffName}`
    );

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
  return isTrainingAdminRole(role);
}

function isAllToken(value: string) {
  return /^all\b/i.test(value);
}

/** Loads the assignment named by :id, writing the 400/404 itself. */
async function findAssignmentForRequest(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid training assignment id.' });
    return null;
  }

  const assignment = await TrainingAssignment.findById(id);
  if (!assignment) {
    res.status(404).json({ message: 'Training assignment not found.' });
    return null;
  }

  return assignment;
}

/**
 * Whether the trainee is allowed to hand the training over for sign-off yet.
 * A waived test counts as satisfied so HR can unblock someone without a fake pass.
 */
export function describeTestGate(assignment: ITrainingAssignment): {
  satisfied: boolean;
  reason: string;
} {
  if (!assignment.testRequired || !assignment.testId) {
    return { satisfied: true, reason: '' };
  }

  if (assignment.testWaived) {
    return { satisfied: true, reason: '' };
  }

  if (assignment.testPassed) {
    return { satisfied: true, reason: '' };
  }

  return {
    satisfied: false,
    reason: 'You must pass the assessment for this training before submitting it for approval.'
  };
}

/**
 * Reviewers default to the trainee's supervisor plus the assigning HR user so an
 * assignment always has someone who can sign it off. The trainee is never a reviewer
 * on their own training.
 */
async function resolveReviewers(
  raw: unknown,
  staff: { _id: mongoose.Types.ObjectId; supervisor?: mongoose.Types.ObjectId },
  actor: IUser
) {
  const requestedIds = Array.isArray(raw)
    ? raw
        .map((entry) =>
          typeof entry === 'string' ? entry : asString((entry as { userId?: unknown })?.userId)
        )
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    : [];

  let ids = requestedIds.map((id) => new mongoose.Types.ObjectId(id));

  if (ids.length === 0) {
    if (staff.supervisor) ids.push(staff.supervisor);
    ids.push(actor._id as mongoose.Types.ObjectId);
  }

  const staffIdString = staff._id.toString();
  const unique = new Map<string, mongoose.Types.ObjectId>();
  for (const id of ids) {
    const key = id.toString();
    if (key !== staffIdString) {
      unique.set(key, id);
    }
  }

  if (unique.size === 0) {
    return [];
  }

  const users = await User.find({ _id: { $in: [...unique.values()] } })
    .select('_id firstName lastName email role')
    .lean();

  return users.map((user) => ({
    userId: user._id,
    name: getUserName(user.firstName, user.lastName, user.email),
    role: user.role
  }));
}

async function notifyStaffAssigned(
  assignment: ITrainingAssignment,
  staff: { _id: mongoose.Types.ObjectId; email?: string },
  hasTest: boolean
) {
  const link = `/training/${(assignment._id as mongoose.Types.ObjectId).toString()}`;
  await createNotification(
    staff._id.toString(),
    'New training assigned',
    `${assignment.assignedByName} assigned you "${assignment.title}".`,
    'info',
    link
  );

  if (staff.email) {
    await notifyTrainingAssigned(
      staff.email,
      assignment.staffName,
      assignment.title,
      assignment.assignedByName,
      assignment.dueDate ? assignment.dueDate.toDateString() : undefined,
      hasTest
    );
  }
}

async function notifyReviewersOfSubmission(assignment: ITrainingAssignment, note: string) {
  const reviewerIds = (assignment.reviewers ?? []).map((reviewer) => reviewer.userId);
  if (reviewerIds.length === 0) {
    return;
  }

  const link = `/training/${(assignment._id as mongoose.Types.ObjectId).toString()}`;
  const testSummary = assignment.testWaived
    ? 'Waived by HR'
    : assignment.testRequired
      ? `Passed — ${assignment.testBestScore ?? 0}%`
      : 'No test attached';

  await Promise.all(
    reviewerIds.map((reviewerId) =>
      createNotification(
        reviewerId.toString(),
        'Training awaiting your approval',
        `${assignment.staffName} submitted "${assignment.title}" for approval.`,
        'info',
        link
      )
    )
  );

  const reviewers = await User.find({ _id: { $in: reviewerIds } })
    .select('email')
    .lean();
  const emails = reviewers.map((reviewer) => reviewer.email).filter(Boolean) as string[];

  if (emails.length > 0) {
    await notifyTrainingSubmittedForReview(
      emails,
      assignment.staffName,
      assignment.title,
      note,
      testSummary
    );
  }
}

async function notifyTraineeOfDecision(
  assignment: ITrainingAssignment,
  decision: 'approved' | 'rejected',
  actorName: string,
  note: string
) {
  const link = `/training/${(assignment._id as mongoose.Types.ObjectId).toString()}`;

  await createNotification(
    assignment.staffId.toString(),
    decision === 'approved' ? 'Training approved' : 'Changes requested on your training',
    decision === 'approved'
      ? `${actorName} approved "${assignment.title}".`
      : `${actorName} requested changes on "${assignment.title}".`,
    decision === 'approved' ? 'success' : 'warning',
    link
  );

  const staff = await User.findById(assignment.staffId).select('email').lean();
  if (!staff?.email) {
    return;
  }

  if (decision === 'approved') {
    await notifyTrainingApproved(staff.email, assignment.staffName, assignment.title, actorName, note);
  } else {
    await notifyTrainingRejected(staff.email, assignment.staffName, assignment.title, actorName, note);
  }
}

async function notifyParticipantsOfComment(
  assignment: ITrainingAssignment,
  author: IUser,
  authorName: string,
  body: string
) {
  const authorId = author._id.toString();
  const recipientIds = [
    assignment.staffId,
    ...(assignment.reviewers ?? []).map((reviewer) => reviewer.userId)
  ]
    .map((id) => id.toString())
    .filter((id, index, all) => id !== authorId && all.indexOf(id) === index);

  if (recipientIds.length === 0) {
    return;
  }

  const link = `/training/${(assignment._id as mongoose.Types.ObjectId).toString()}`;
  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification(
        recipientId,
        'New training comment',
        `${authorName} commented on "${assignment.title}".`,
        'info',
        link
      )
    )
  );

  const recipients = await User.find({ _id: { $in: recipientIds } })
    .select('email')
    .lean();
  const emails = recipients.map((recipient) => recipient.email).filter(Boolean) as string[];

  if (emails.length > 0) {
    await notifyTrainingComment(emails, authorName, assignment.title, body);
  }
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

  // Awaiting sign-off: the trainee's work is done, the record is not.
  if (status === 'pending_review') {
    return 90;
  }

  if (requestedProgress !== null) {
    return Math.min(99, Math.max(0, Math.round(requestedProgress)));
  }

  if (status === 'in_progress') {
    return 50;
  }

  return 0;
}

/** Periods HR can pick between, newest first. */
async function listAvailablePeriods() {
  const periods = await AppraisalPeriod.find({})
    .sort({ endDate: -1, createdAt: -1 })
    .select('_id name')
    .lean();

  return periods.map((period) => ({
    id: period._id.toString(),
    name: period.name
  }));
}

/**
 * Accepts a period id or a period name. `Appraisal.period` stores the name, so an id
 * arriving from a `<Select>` used to silently match nothing.
 */
async function resolveRecommendationPeriod(requestedPeriod?: string) {
  if (requestedPeriod) {
    if (mongoose.Types.ObjectId.isValid(requestedPeriod)) {
      const period = await AppraisalPeriod.findById(requestedPeriod).select('name').lean();
      if (period?.name) {
        return period.name;
      }
    }
    return requestedPeriod;
  }

  const latestConfiguredPeriod = await AppraisalPeriod.findOne(getLastRelevantPeriodFilter())
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
