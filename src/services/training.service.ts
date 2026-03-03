import { ITrainingAssignment, TrainingAssignmentStatus } from '../models/TrainingAssignment';

const EMPLOYEE_TRAINING_NEEDED_QUESTION_IDS = ['q1766971270364'];
const APPRAISER_TRAINING_RECOMMENDATION_QUESTION_IDS = ['q1766971484543'];
const ACTION_RECOMMENDED_QUESTION_IDS = ['q21', 'q29'];

interface AppraisalResponseSnapshot {
  questionId: string;
  response: unknown;
}

interface AppraisalReviewSnapshot {
  responses?: AppraisalResponseSnapshot[];
}

interface AppraisalSnapshot {
  _id: { toString: () => string };
  period?: string;
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
  createdAt: string;
  updatedAt: string;
}

export function extractTrainingRecommendationSignals(appraisal?: AppraisalSnapshot | null): TrainingRecommendationSignals {
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
    trainingNeededByEmployee: findLatestResponse(
      appraisal.reviews,
      EMPLOYEE_TRAINING_NEEDED_QUESTION_IDS
    ),
    trainingRecommendedByAppraiser: findLatestResponse(
      appraisal.adminEditedVersion?.reviews ?? appraisal.reviews,
      APPRAISER_TRAINING_RECOMMENDATION_QUESTION_IDS
    ),
    actionRecommended: findLatestResponse(appraisal.reviews, ACTION_RECOMMENDED_QUESTION_IDS)
  };
}

export function serializeTrainingAssignment(record: ITrainingAssignment): SerializedTrainingAssignment {
  return {
    id: record._id.toString(),
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
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function findLatestResponse(reviews: AppraisalReviewSnapshot[] | undefined, questionIds: string[]) {
  if (!reviews || reviews.length === 0) {
    return '';
  }

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

function normalizeResponse(value: unknown): string {
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
