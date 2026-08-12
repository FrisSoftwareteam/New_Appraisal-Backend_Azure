import mongoose from 'mongoose';
import {
  ITrainingTest,
  ITrainingTestQuestion,
  TRAINING_TEST_QUESTION_TYPES,
  TrainingTestQuestionType
} from '../models/TrainingTest';
import {
  ITrainingTestAnswer,
  ITrainingTestAttempt,
  ITrainingTestSnapshot
} from '../models/TrainingTestAttempt';

/** A question with every answer key removed — the only shape a trainee may receive. */
export interface SanitizedTestQuestion {
  id: string;
  text: string;
  type: TrainingTestQuestionType;
  section?: string;
  points: number;
  options?: { id: string; label: string }[];
  isRequired: boolean;
}

export interface GradedAnswer extends ITrainingTestAnswer {
  correct: unknown;
  explanation?: string;
}

export interface GradeResult {
  earnedPoints: number;
  totalPoints: number;
  score: number;
  passed: boolean;
  gradedAnswers: ITrainingTestAnswer[];
}

/**
 * Strips `isCorrect`, `acceptedAnswers` and `explanation`. Appraisal templates are
 * readable in full by any authenticated user; a graded test cannot be, so the answer
 * key must never leave the server before the attempt is submitted.
 */
export function sanitizeQuestionForTaker(question: ITrainingTestQuestion): SanitizedTestQuestion {
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    section: question.section ?? undefined,
    points: question.points ?? 1,
    options: question.options?.map((option) => ({ id: option.id, label: option.label })),
    isRequired: question.isRequired !== false
  };
}

export function sanitizeSnapshotForTaker(snapshot: ITrainingTestSnapshot) {
  return {
    testId: snapshot.testId.toString(),
    name: snapshot.name,
    passMark: snapshot.passMark,
    timeLimitMinutes: snapshot.timeLimitMinutes ?? undefined,
    questions: (snapshot.questions ?? []).map(sanitizeQuestionForTaker)
  };
}

export function buildTestSnapshot(test: ITrainingTest): ITrainingTestSnapshot {
  const questions = (test.questions ?? []).map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    section: question.section,
    points: question.points ?? 1,
    options: question.options?.map((option) => ({
      id: option.id,
      label: option.label,
      isCorrect: Boolean(option.isCorrect)
    })),
    acceptedAnswers: question.acceptedAnswers,
    explanation: question.explanation,
    isRequired: question.isRequired !== false
  }));

  if (test.shuffleQuestions) {
    for (let i = questions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }

  return {
    testId: test._id as mongoose.Types.ObjectId,
    name: test.name,
    passMark: test.passMark,
    timeLimitMinutes: test.timeLimitMinutes ?? undefined,
    questions
  };
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string' && value) {
    return [value];
  }
  return [];
}

function gradeQuestion(
  question: ITrainingTestQuestion,
  response: unknown
): { awardedPoints: number; isCorrect: boolean } {
  const points = question.points ?? 1;

  switch (question.type) {
    case 'multiple_choice':
    case 'true_false': {
      const selected = typeof response === 'string' ? response : '';
      const isCorrect = Boolean(
        selected && question.options?.some((option) => option.id === selected && option.isCorrect)
      );
      return { awardedPoints: isCorrect ? points : 0, isCorrect };
    }

    case 'multi_select': {
      // All-or-nothing: the selected set must equal the correct set exactly. Partial
      // credit is harder to explain to a trainee than it is worth here.
      const selected = new Set(toStringArray(response));
      const correct = new Set(
        (question.options ?? []).filter((option) => option.isCorrect).map((option) => option.id)
      );
      const isCorrect =
        correct.size > 0 &&
        selected.size === correct.size &&
        [...correct].every((id) => selected.has(id));
      return { awardedPoints: isCorrect ? points : 0, isCorrect };
    }

    case 'short_text': {
      const answer = normalizeText(response);
      const accepted = (question.acceptedAnswers ?? []).map(normalizeText).filter(Boolean);
      const isCorrect = Boolean(answer && accepted.includes(answer));
      return { awardedPoints: isCorrect ? points : 0, isCorrect };
    }

    default:
      return { awardedPoints: 0, isCorrect: false };
  }
}

/**
 * Grades an attempt against its own frozen snapshot. Always run on the server —
 * appraisal scoring trusts a client-computed `overallScore`, which is fine there and
 * not fine for a pass/fail assessment.
 */
export function gradeAttempt(
  snapshot: ITrainingTestSnapshot,
  submitted: Array<{ questionId: string; response: unknown }>
): GradeResult {
  const responseByQuestionId = new Map(
    submitted.map((entry) => [entry.questionId, entry.response])
  );

  let earnedPoints = 0;
  let totalPoints = 0;
  const gradedAnswers: ITrainingTestAnswer[] = [];

  for (const question of snapshot.questions ?? []) {
    const points = question.points ?? 1;
    totalPoints += points;

    const response = responseByQuestionId.get(question.id);
    const { awardedPoints, isCorrect } = gradeQuestion(question, response);
    earnedPoints += awardedPoints;

    gradedAnswers.push({
      questionId: question.id,
      response: response ?? null,
      awardedPoints,
      isCorrect
    });
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return {
    earnedPoints,
    totalPoints,
    score,
    passed: totalPoints > 0 && score >= snapshot.passMark,
    gradedAnswers
  };
}

/**
 * Attempt as returned after grading — answer keys are fair game now that the trainee
 * has committed, so results can be explained.
 */
export function serializeGradedAttempt(attempt: ITrainingTestAttempt) {
  const questionById = new Map(
    (attempt.testSnapshot.questions ?? []).map((question) => [question.id, question])
  );

  return {
    id: (attempt._id as mongoose.Types.ObjectId).toString(),
    assignmentId: attempt.assignmentId.toString(),
    testId: attempt.testId.toString(),
    staffId: attempt.staffId.toString(),
    staffName: attempt.staffName,
    attemptNumber: attempt.attemptNumber,
    testName: attempt.testSnapshot.name,
    passMark: attempt.testSnapshot.passMark,
    earnedPoints: attempt.earnedPoints,
    totalPoints: attempt.totalPoints,
    score: attempt.score,
    passed: attempt.passed,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString(),
    answers: (attempt.answers ?? []).map((answer) => {
      const question = questionById.get(answer.questionId);
      return {
        questionId: answer.questionId,
        questionText: question?.text ?? '',
        type: question?.type,
        options: question?.options?.map((option) => ({
          id: option.id,
          label: option.label,
          isCorrect: Boolean(option.isCorrect)
        })),
        acceptedAnswers: question?.acceptedAnswers ?? undefined,
        explanation: question?.explanation ?? undefined,
        response: answer.response,
        awardedPoints: answer.awardedPoints,
        points: question?.points ?? 0,
        isCorrect: answer.isCorrect
      };
    })
  };
}

/** Summary row for the attempt history list — no answer detail. */
export function serializeAttemptSummary(attempt: ITrainingTestAttempt) {
  return {
    id: (attempt._id as mongoose.Types.ObjectId).toString(),
    attemptNumber: attempt.attemptNumber,
    testName: attempt.testSnapshot.name,
    passMark: attempt.testSnapshot.passMark,
    score: attempt.score,
    earnedPoints: attempt.earnedPoints,
    totalPoints: attempt.totalPoints,
    passed: attempt.passed,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString()
  };
}

export function isTrainingTestQuestionType(value: string): value is TrainingTestQuestionType {
  return TRAINING_TEST_QUESTION_TYPES.includes(value as TrainingTestQuestionType);
}
