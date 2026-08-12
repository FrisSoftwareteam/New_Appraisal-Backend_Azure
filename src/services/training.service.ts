import mongoose from 'mongoose';
import AppraisalTemplate, {
  TRAINING_SIGNAL_KINDS,
  TrainingSignalKind
} from '../models/AppraisalTemplate';
import { ITrainingAssignment, TrainingAssignmentStatus } from '../models/TrainingAssignment';
import { IUser } from '../models/User';
import { createTtlCache } from '../utils/ttl-cache';

/**
 * Question ids the training signals were originally hardcoded to. These stay as a
 * fallback so appraisals answered before templates were taggable keep resolving —
 * they are unioned with whatever the templates declare, never replaced by it.
 */
export const LEGACY_TRAINING_SIGNAL_IDS: Record<TrainingSignalKind, string[]> = {
  employee_need: ['q1766971270364'],
  appraiser_recommendation: ['q1766971484543'],
  action_recommended: ['q21', 'q29']
};

export type TrainingSignalMap = Record<TrainingSignalKind, string[]>;

interface AppraisalResponseSnapshot {
  questionId: string;
  response: unknown;
}

interface AppraisalReviewSnapshot {
  responses?: AppraisalResponseSnapshot[];
}

export interface AppraisalSnapshot {
  _id: { toString: () => string };
  period?: string;
  status?: string;
  createdAt?: Date;
  reviews?: AppraisalReviewSnapshot[];
  adminEditedVersion?: {
    reviews?: AppraisalReviewSnapshot[];
  };
}

export interface TrainingRecommendationSignals {
  sourceAppraisalId?: string;
  sourcePeriod?: string;
  trainingNeededByEmployee: string;
  trainingRecommendedByAppraiser: string;
  actionRecommended: string;
}

export interface SerializedTrainingReviewer {
  userId: string;
  name: string;
  role?: string;
}

export interface SerializedTrainingAssignment {
  id: string;
  staffId: string;
  staffName: string;
  department?: string;
  division?: string;
  grade?: string;
  title: string;
  description: string;
  provider?: string;
  deliveryMode: string;
  priority: string;
  startDate?: string;
  dueDate?: string;
  status: TrainingAssignmentStatus;
  progress: number;
  notes?: string;
  completionNotes?: string;
  assignedById: string;
  assignedByName: string;
  assignedAt: string;
  completedAt?: string;
  sourceAppraisalId?: string;
  sourcePeriod?: string;
  trainingNeededByEmployee?: string;
  trainingRecommendedByAppraiser?: string;
  testId?: string;
  testRequired: boolean;
  testPassed?: boolean;
  testBestScore?: number;
  testAttemptsUsed: number;
  testAttemptsGranted?: number;
  testWaived: boolean;
  testWaivedReason?: string;
  reviewers: SerializedTrainingReviewer[];
  submittedForReviewAt?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

function emptySignalMap(): TrainingSignalMap {
  return TRAINING_SIGNAL_KINDS.reduce((acc, kind) => {
    acc[kind] = [];
    return acc;
  }, {} as TrainingSignalMap);
}

/**
 * Resolves which appraisal question ids feed each training signal, by reading the
 * `trainingSignal` tag off every template question and unioning in the legacy ids.
 * Cached because the recommendations endpoint would otherwise re-read every template
 * on each request.
 */
export const getTrainingSignalMap = createTtlCache<TrainingSignalMap>(async () => {
  const map = emptySignalMap();

  const templates = await AppraisalTemplate.find({})
    .select('questions.id questions.trainingSignal')
    .lean();

  for (const template of templates) {
    for (const question of template.questions ?? []) {
      const kind = question.trainingSignal as TrainingSignalKind | undefined;
      if (!kind || !map[kind] || !question.id) {
        continue;
      }
      if (!map[kind].includes(question.id)) {
        map[kind].push(question.id);
      }
    }
  }

  for (const kind of TRAINING_SIGNAL_KINDS) {
    for (const legacyId of LEGACY_TRAINING_SIGNAL_IDS[kind]) {
      if (!map[kind].includes(legacyId)) {
        map[kind].push(legacyId);
      }
    }
  }

  return map;
}, 60_000);

export function extractTrainingRecommendationSignals(
  appraisal: AppraisalSnapshot | null | undefined,
  signalMap: TrainingSignalMap
): TrainingRecommendationSignals {
  if (!appraisal) {
    return {
      trainingNeededByEmployee: '',
      trainingRecommendedByAppraiser: '',
      actionRecommended: ''
    };
  }

  return {
    sourceAppraisalId: appraisal._id?.toString?.(),
    sourcePeriod: appraisal.period,
    trainingNeededByEmployee: findLatestResponse(appraisal.reviews, signalMap.employee_need),
    // Committee/admin edits supersede the appraiser's original answer when present.
    trainingRecommendedByAppraiser: findLatestResponse(
      appraisal.adminEditedVersion?.reviews ?? appraisal.reviews,
      signalMap.appraiser_recommendation
    ),
    actionRecommended: findLatestResponse(appraisal.reviews, signalMap.action_recommended)
  };
}

export function hasAnyTrainingSignal(signals: TrainingRecommendationSignals): boolean {
  return Boolean(
    signals.trainingNeededByEmployee ||
      signals.trainingRecommendedByAppraiser ||
      signals.actionRecommended
  );
}

/**
 * Reads a single signal out of a review set. Exported so report exports can pull
 * individual columns (e.g. appraiser vs committee recommendation) from the same
 * question-id source as everything else.
 */
export function findLatestResponse(
  reviews: AppraisalReviewSnapshot[] | undefined,
  questionIds: string[]
): string {
  if (!reviews || reviews.length === 0 || questionIds.length === 0) {
    return '';
  }

  // Walk backwards: the newest review step wins, but keep going if it left the
  // question blank so an earlier non-empty answer is still surfaced.
  for (let i = reviews.length - 1; i >= 0; i -= 1) {
    const responses = reviews[i].responses ?? [];
    const response = responses.find((item) => questionIds.includes(item.questionId));
    if (response) {
      const text = normalizeResponse(response.response);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

export function normalizeResponse(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts: string[] = value.map((entry) => normalizeResponse(entry)).filter(Boolean);
    return parts.join(', ').trim();
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

export interface TrainingAssignmentAccess {
  isOwner: boolean;
  isReviewer: boolean;
  isAdmin: boolean;
  canView: boolean;
  canComment: boolean;
  canApprove: boolean;
}

const TRAINING_ADMIN_ROLES = ['hr_admin', 'super_admin'];

export function isTrainingAdminRole(role?: string): boolean {
  return TRAINING_ADMIN_ROLES.includes(role ?? '');
}

/**
 * Single gate for every assignment-scoped route: the trainee, anyone on the
 * assignment's reviewer list, and training admins.
 */
export function resolveAssignmentAccess(
  user: IUser,
  assignment: ITrainingAssignment
): TrainingAssignmentAccess {
  const userId = user._id.toString();
  const isOwner = assignment.staffId.toString() === userId;
  const isReviewer = (assignment.reviewers ?? []).some(
    (reviewer) => reviewer.userId?.toString() === userId
  );
  const isAdmin = isTrainingAdminRole(user.role);

  return {
    isOwner,
    isReviewer,
    isAdmin,
    canView: isOwner || isReviewer || isAdmin,
    canComment: isOwner || isReviewer || isAdmin,
    // Nobody signs off on their own training, including an admin who assigned it to
    // themselves and anyone left on their own reviewer list by older data. Admins
    // still have the status PATCH if they genuinely need to force it.
    canApprove: !isOwner && (isReviewer || isAdmin)
  };
}

export function serializeTrainingAssignment(
  record: ITrainingAssignment
): SerializedTrainingAssignment {
  return {
    id: (record._id as mongoose.Types.ObjectId).toString(),
    staffId: record.staffId.toString(),
    staffName: record.staffName,
    department: record.department ?? undefined,
    division: record.division ?? undefined,
    grade: record.grade ?? undefined,
    title: record.title,
    description: record.description,
    provider: record.provider ?? undefined,
    deliveryMode: record.deliveryMode,
    priority: record.priority,
    startDate: record.startDate?.toISOString(),
    dueDate: record.dueDate?.toISOString(),
    status: record.status,
    progress: record.progress,
    notes: record.notes ?? undefined,
    completionNotes: record.completionNotes ?? undefined,
    assignedById: record.assignedById.toString(),
    assignedByName: record.assignedByName,
    assignedAt: record.assignedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    sourceAppraisalId: record.sourceAppraisalId?.toString(),
    sourcePeriod: record.sourcePeriod ?? undefined,
    trainingNeededByEmployee: record.trainingNeededByEmployee ?? undefined,
    trainingRecommendedByAppraiser: record.trainingRecommendedByAppraiser ?? undefined,
    testId: record.testId?.toString(),
    testRequired: Boolean(record.testRequired),
    testPassed: record.testPassed ?? undefined,
    testBestScore: record.testBestScore ?? undefined,
    testAttemptsUsed: record.testAttemptsUsed ?? 0,
    testAttemptsGranted: record.testAttemptsGranted ?? undefined,
    testWaived: Boolean(record.testWaived),
    testWaivedReason: record.testWaivedReason ?? undefined,
    reviewers: (record.reviewers ?? []).map((reviewer) => ({
      userId: reviewer.userId.toString(),
      name: reviewer.name,
      role: reviewer.role ?? undefined
    })),
    submittedForReviewAt: record.submittedForReviewAt?.toISOString(),
    approvedById: record.approvedById?.toString(),
    approvedByName: record.approvedByName ?? undefined,
    approvedAt: record.approvedAt?.toISOString(),
    rejectionReason: record.rejectionReason ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
