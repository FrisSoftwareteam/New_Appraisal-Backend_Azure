import mongoose from 'mongoose';
import { Response } from 'express';
import TrainingAssignment, { ITrainingAssignment } from '../models/TrainingAssignment';
import TrainingComment from '../models/TrainingComment';
import TrainingTest, {
  ITrainingTestOption,
  ITrainingTestQuestion,
  TRAINING_TEST_STATUSES,
  TrainingTestStatus
} from '../models/TrainingTest';
import TrainingTestAttempt from '../models/TrainingTestAttempt';
import { AuthRequest } from '../middleware/auth.middleware';
import { isTrainingAdminRole, resolveAssignmentAccess } from '../services/training.service';
import {
  buildTestSnapshot,
  gradeAttempt,
  isTrainingTestQuestionType,
  sanitizeSnapshotForTaker,
  serializeAttemptSummary,
  serializeGradedAttempt
} from '../services/training-test.service';
import { createAuditLog } from './audit.controller';

// ─── Test library (HR) ───────────────────────────────────────────────

export const getTrainingTests = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const status = asString(req.query.status);
    const filter: mongoose.FilterQuery<typeof TrainingTest> = {};
    if (status && isTrainingTestStatus(status)) {
      filter.status = status;
    }

    const tests = await TrainingTest.find(filter).sort({ updatedAt: -1 });
    return res.json({ items: tests.map(serializeTestSummary) });
  } catch (error) {
    console.error('Error fetching training tests:', error);
    return res.status(500).json({ message: 'Error fetching training tests' });
  }
};

export const getTrainingTestById = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training test id.' });
    }

    const test = await TrainingTest.findById(id);
    if (!test) {
      return res.status(404).json({ message: 'Training test not found.' });
    }

    return res.json({ item: serializeTestForAdmin(test) });
  } catch (error) {
    console.error('Error fetching training test:', error);
    return res.status(500).json({ message: 'Error fetching training test' });
  }
};

export const createTrainingTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const name = asString(req.body?.name);
    if (!name) {
      return res.status(400).json({ message: 'name is required.' });
    }

    const parsed = parseQuestions(req.body?.questions);
    if ('error' in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    const status = asString(req.body?.status);
    const resolvedStatus = isTrainingTestStatus(status) ? status : 'draft';

    if (resolvedStatus === 'active' && parsed.questions.length === 0) {
      return res.status(400).json({ message: 'An active test must have at least one question.' });
    }

    const test = await TrainingTest.create({
      name,
      description: asString(req.body?.description) || undefined,
      questions: parsed.questions,
      passMark: clampPercent(toNumber(req.body?.passMark) ?? 70),
      maxAttempts: Math.max(0, Math.round(toNumber(req.body?.maxAttempts) ?? 3)),
      timeLimitMinutes: resolveTimeLimit(req.body?.timeLimitMinutes),
      shuffleQuestions: Boolean(req.body?.shuffleQuestions),
      status: resolvedStatus,
      createdBy: req.user!._id,
      createdByName: getUserName(req.user?.firstName, req.user?.lastName, req.user?.email)
    });

    return res.status(201).json({ item: serializeTestForAdmin(test) });
  } catch (error) {
    console.error('Error creating training test:', error);
    return res.status(500).json({ message: 'Error creating training test' });
  }
};

export const updateTrainingTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training test id.' });
    }

    const test = await TrainingTest.findById(id);
    if (!test) {
      return res.status(404).json({ message: 'Training test not found.' });
    }

    const name = asString(req.body?.name);
    if (name) {
      test.name = name;
    }

    if (req.body?.description !== undefined) {
      test.description = asString(req.body?.description) || undefined;
    }

    if (req.body?.questions !== undefined) {
      const parsed = parseQuestions(req.body?.questions);
      if ('error' in parsed) {
        return res.status(400).json({ message: parsed.error });
      }
      test.questions = parsed.questions;
    }

    if (req.body?.passMark !== undefined) {
      test.passMark = clampPercent(toNumber(req.body?.passMark) ?? test.passMark);
    }
    if (req.body?.maxAttempts !== undefined) {
      test.maxAttempts = Math.max(0, Math.round(toNumber(req.body?.maxAttempts) ?? test.maxAttempts));
    }
    if (req.body?.timeLimitMinutes !== undefined) {
      test.timeLimitMinutes = resolveTimeLimit(req.body?.timeLimitMinutes);
    }
    if (req.body?.shuffleQuestions !== undefined) {
      test.shuffleQuestions = Boolean(req.body?.shuffleQuestions);
    }

    const status = asString(req.body?.status);
    if (status && isTrainingTestStatus(status)) {
      if (status === 'active' && (test.questions ?? []).length === 0) {
        return res.status(400).json({ message: 'An active test must have at least one question.' });
      }
      test.status = status;
    }

    await test.save();
    return res.json({ item: serializeTestForAdmin(test) });
  } catch (error) {
    console.error('Error updating training test:', error);
    return res.status(500).json({ message: 'Error updating training test' });
  }
};

export const deleteTrainingTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid training test id.' });
    }

    const test = await TrainingTest.findById(id);
    if (!test) {
      return res.status(404).json({ message: 'Training test not found.' });
    }

    // Attempts keep their own snapshot, so past results survive; live assignments
    // would be left pointing at nothing, which is a different problem.
    const inUse = await TrainingAssignment.countDocuments({
      testId: test._id,
      status: { $in: ['assigned', 'in_progress', 'pending_review'] }
    });
    if (inUse > 0) {
      return res.status(409).json({
        message: `This test is attached to ${inUse} active training assignment(s). Archive it instead.`
      });
    }

    await test.deleteOne();
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting training test:', error);
    return res.status(500).json({ message: 'Error deleting training test' });
  }
};

// ─── Taking a test (trainee) ─────────────────────────────────────────

export const startTrainingTestAttempt = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignment(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.isOwner) {
      return res.status(403).json({ message: 'Only the assigned staff member can take this test.' });
    }

    if (!assignment.testId || !assignment.testRequired) {
      return res.status(400).json({ message: 'This training has no test attached.' });
    }

    if (['completed', 'cancelled'].includes(assignment.status)) {
      return res.status(409).json({ message: 'This training is closed.' });
    }

    if (assignment.testWaived) {
      return res.status(409).json({ message: 'The test for this training has been waived.' });
    }

    // Resume rather than burn an attempt if they navigated away mid-test.
    const existing = await TrainingTestAttempt.findOne({
      assignmentId: assignment._id,
      status: 'in_progress'
    }).sort({ attemptNumber: -1 });

    if (existing) {
      return res.json({
        attemptId: (existing._id as mongoose.Types.ObjectId).toString(),
        attemptNumber: existing.attemptNumber,
        startedAt: existing.startedAt.toISOString(),
        resumed: true,
        test: sanitizeSnapshotForTaker(existing.testSnapshot)
      });
    }

    const test = await TrainingTest.findById(assignment.testId);
    if (!test) {
      return res.status(404).json({ message: 'Training test not found.' });
    }

    const allowedAttempts = assignment.testAttemptsGranted ?? test.maxAttempts;
    if (allowedAttempts > 0 && (assignment.testAttemptsUsed ?? 0) >= allowedAttempts) {
      return res.status(409).json({
        message: `You have used all ${allowedAttempts} attempt(s). Ask HR to reset or waive the test.`
      });
    }

    const attempt = await TrainingTestAttempt.create({
      assignmentId: assignment._id,
      testId: test._id,
      staffId: assignment.staffId,
      staffName: assignment.staffName,
      attemptNumber: (assignment.testAttemptsUsed ?? 0) + 1,
      testSnapshot: buildTestSnapshot(test),
      status: 'in_progress',
      startedAt: new Date()
    });

    return res.status(201).json({
      attemptId: (attempt._id as mongoose.Types.ObjectId).toString(),
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt.toISOString(),
      resumed: false,
      // Sanitized: the answer key never leaves the server before grading.
      test: sanitizeSnapshotForTaker(attempt.testSnapshot)
    });
  } catch (error) {
    console.error('Error starting training test attempt:', error);
    return res.status(500).json({ message: 'Error starting training test attempt' });
  }
};

export const submitTrainingTestAttempt = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignment(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.isOwner) {
      return res.status(403).json({ message: 'Only the assigned staff member can take this test.' });
    }

    const attemptId = asString(req.body?.attemptId);
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: 'Valid attemptId is required.' });
    }

    const attempt = await TrainingTestAttempt.findById(attemptId);
    if (!attempt || attempt.assignmentId.toString() !== (assignment._id as mongoose.Types.ObjectId).toString()) {
      return res.status(404).json({ message: 'Test attempt not found.' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(409).json({ message: 'This attempt has already been submitted.' });
    }

    const answers = Array.isArray(req.body?.answers)
      ? req.body.answers
          .map((entry: unknown) => {
            const record = entry as { questionId?: unknown; response?: unknown };
            return {
              questionId: asString(record?.questionId),
              response: record?.response
            };
          })
          .filter((entry: { questionId: string }) => Boolean(entry.questionId))
      : [];

    // Graded against the attempt's own snapshot, on the server. A client-supplied
    // score is never trusted for a pass/fail assessment.
    const result = gradeAttempt(attempt.testSnapshot, answers);

    attempt.answers = result.gradedAnswers;
    attempt.earnedPoints = result.earnedPoints;
    attempt.totalPoints = result.totalPoints;
    attempt.score = result.score;
    attempt.passed = result.passed;
    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    assignment.testAttemptsUsed = (assignment.testAttemptsUsed ?? 0) + 1;
    assignment.testBestScore = Math.max(assignment.testBestScore ?? 0, result.score);
    assignment.testPassed = Boolean(assignment.testPassed) || result.passed;
    if (assignment.status === 'assigned') {
      assignment.status = 'in_progress';
      assignment.progress = 50;
    }
    await assignment.save();

    const allowedAttempts =
      assignment.testAttemptsGranted ??
      (await TrainingTest.findById(assignment.testId).select('maxAttempts').lean())?.maxAttempts ??
      0;

    return res.json({
      attempt: serializeGradedAttempt(attempt),
      assignment: {
        testPassed: assignment.testPassed,
        testBestScore: assignment.testBestScore,
        testAttemptsUsed: assignment.testAttemptsUsed,
        attemptsRemaining:
          allowedAttempts > 0 ? Math.max(0, allowedAttempts - assignment.testAttemptsUsed) : null
      }
    });
  } catch (error) {
    console.error('Error submitting training test attempt:', error);
    return res.status(500).json({ message: 'Error submitting training test attempt' });
  }
};

export const getTrainingTestAttempts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Please authenticate.' });
    }

    const assignment = await findAssignment(req, res);
    if (!assignment) {
      return;
    }

    const access = resolveAssignmentAccess(req.user, assignment);
    if (!access.canView) {
      return res.status(403).json({ message: 'You do not have access to this training assignment.' });
    }

    const attempts = await TrainingTestAttempt.find({ assignmentId: assignment._id }).sort({
      attemptNumber: -1
    });

    const detailId = asString(req.query.attemptId);
    let detail = null;
    if (detailId && mongoose.Types.ObjectId.isValid(detailId)) {
      const match = attempts.find(
        (attempt) => (attempt._id as mongoose.Types.ObjectId).toString() === detailId
      );
      // Answer keys are fair game only once the attempt is committed.
      if (match && match.status === 'submitted') {
        detail = serializeGradedAttempt(match);
      }
    }

    const allowedAttempts =
      assignment.testAttemptsGranted ??
      (assignment.testId
        ? (await TrainingTest.findById(assignment.testId).select('maxAttempts').lean())?.maxAttempts
        : 0) ??
      0;

    return res.json({
      items: attempts.map(serializeAttemptSummary),
      detail,
      maxAttempts: allowedAttempts,
      attemptsUsed: assignment.testAttemptsUsed ?? 0,
      attemptsRemaining:
        allowedAttempts > 0
          ? Math.max(0, allowedAttempts - (assignment.testAttemptsUsed ?? 0))
          : null
    });
  } catch (error) {
    console.error('Error fetching training test attempts:', error);
    return res.status(500).json({ message: 'Error fetching training test attempts' });
  }
};

/** HR unblocks a trainee who has exhausted their attempts: grant more, or waive. */
export const resetTrainingTestAttempts = async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTrainingAdmin(req, res)) {
      return;
    }

    const assignment = await findAssignment(req, res);
    if (!assignment) {
      return;
    }

    if (!assignment.testId) {
      return res.status(400).json({ message: 'This training has no test attached.' });
    }

    const waive = Boolean(req.body?.waive);
    const reason = asString(req.body?.reason);
    const actorName = getUserName(req.user?.firstName, req.user?.lastName, req.user?.email);

    if (waive) {
      if (!reason) {
        return res.status(400).json({ message: 'A reason is required to waive the test.' });
      }
      assignment.testWaived = true;
      assignment.testWaivedReason = reason;
    } else {
      const extraAttempts = Math.max(1, Math.round(toNumber(req.body?.extraAttempts) ?? 1));
      const test = await TrainingTest.findById(assignment.testId).select('maxAttempts').lean();
      const currentAllowance = assignment.testAttemptsGranted ?? test?.maxAttempts ?? 0;

      if (currentAllowance === 0) {
        return res.status(400).json({ message: 'This test already allows unlimited attempts.' });
      }

      assignment.testAttemptsGranted = currentAllowance + extraAttempts;
    }

    await assignment.save();

    await TrainingComment.create({
      assignmentId: assignment._id,
      authorId: req.user!._id,
      authorName: actorName,
      authorRole: req.user!.role,
      body: waive
        ? `Waived the assessment requirement. Reason: ${reason}`
        : `Granted additional test attempts (now ${assignment.testAttemptsGranted} total).`,
      kind: 'system'
    });

    await createAuditLog(
      req.user!._id.toString(),
      waive ? 'training_test_waived' : 'training_test_attempts_reset',
      'TrainingAssignment',
      (assignment._id as mongoose.Types.ObjectId).toString(),
      waive
        ? `Waived test for "${assignment.title}" (${assignment.staffName}): ${reason}`
        : `Granted extra test attempts for "${assignment.title}" (${assignment.staffName})`
    );

    return res.json({
      item: {
        testWaived: assignment.testWaived,
        testWaivedReason: assignment.testWaivedReason,
        testAttemptsGranted: assignment.testAttemptsGranted,
        testAttemptsUsed: assignment.testAttemptsUsed
      }
    });
  } catch (error) {
    console.error('Error resetting training test attempts:', error);
    return res.status(500).json({ message: 'Error resetting training test attempts' });
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureTrainingAdmin(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: 'Please authenticate.' });
    return false;
  }

  if (!isTrainingAdminRole(req.user.role)) {
    res.status(403).json({ message: 'Only HR Admin or Super Admin can manage training tests.' });
    return false;
  }

  return true;
}

async function findAssignment(req: AuthRequest, res: Response): Promise<ITrainingAssignment | null> {
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

function parseQuestions(
  raw: unknown
): { questions: ITrainingTestQuestion[] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { questions: [] };
  }

  const questions: ITrainingTestQuestion[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry] of raw.entries()) {
    const record = entry as Record<string, unknown>;
    const text = asString(record?.text);
    const type = asString(record?.type);

    if (!text) {
      return { error: `Question ${index + 1} is missing its text.` };
    }
    if (!isTrainingTestQuestionType(type)) {
      return { error: `Question ${index + 1} has an unsupported type.` };
    }

    let id = asString(record?.id);
    if (!id || seenIds.has(id)) {
      id = `q${Date.now()}${index}`;
    }
    seenIds.add(id);

    const question: ITrainingTestQuestion = {
      id,
      text,
      type,
      section: asString(record?.section) || undefined,
      points: Math.max(0, Math.round(toNumber(record?.points) ?? 1)),
      explanation: asString(record?.explanation) || undefined,
      isRequired: record?.isRequired !== false
    };

    if (type === 'short_text') {
      const accepted = Array.isArray(record?.acceptedAnswers)
        ? (record.acceptedAnswers as unknown[]).map((value) => asString(value)).filter(Boolean)
        : [];
      if (accepted.length === 0) {
        return { error: `Question ${index + 1} needs at least one accepted answer.` };
      }
      question.acceptedAnswers = accepted;
    } else {
      const options = parseOptions(record?.options, id);
      if (options.length < 2) {
        return { error: `Question ${index + 1} needs at least two options.` };
      }
      if (!options.some((option) => option.isCorrect)) {
        return { error: `Question ${index + 1} needs at least one correct option.` };
      }
      if (type !== 'multi_select' && options.filter((option) => option.isCorrect).length > 1) {
        return {
          error: `Question ${index + 1} allows only one correct option. Use Multi-select instead.`
        };
      }
      question.options = options;
    }

    questions.push(question);
  }

  return { questions };
}

function parseOptions(raw: unknown, questionId: string): ITrainingTestOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry, index) => {
      const record = entry as Record<string, unknown>;
      const label = asString(record?.label);
      if (!label) {
        return null;
      }
      return {
        id: asString(record?.id) || `${questionId}-o${index}`,
        label,
        isCorrect: Boolean(record?.isCorrect)
      };
    })
    .filter((option): option is ITrainingTestOption => option !== null);
}

function serializeTestSummary(test: InstanceType<typeof TrainingTest>) {
  return {
    id: (test._id as mongoose.Types.ObjectId).toString(),
    name: test.name,
    description: test.description ?? undefined,
    questionCount: (test.questions ?? []).length,
    totalPoints: (test.questions ?? []).reduce((sum, question) => sum + (question.points ?? 0), 0),
    passMark: test.passMark,
    maxAttempts: test.maxAttempts,
    timeLimitMinutes: test.timeLimitMinutes ?? undefined,
    shuffleQuestions: test.shuffleQuestions,
    status: test.status,
    createdByName: test.createdByName,
    createdAt: test.createdAt.toISOString(),
    updatedAt: test.updatedAt.toISOString()
  };
}

function serializeTestForAdmin(test: InstanceType<typeof TrainingTest>) {
  return {
    ...serializeTestSummary(test),
    questions: (test.questions ?? []).map((question) => ({
      id: question.id,
      text: question.text,
      type: question.type,
      section: question.section ?? undefined,
      points: question.points,
      options: question.options?.map((option) => ({
        id: option.id,
        label: option.label,
        isCorrect: Boolean(option.isCorrect)
      })),
      acceptedAnswers: question.acceptedAnswers ?? undefined,
      explanation: question.explanation ?? undefined,
      isRequired: question.isRequired
    }))
  };
}

function isTrainingTestStatus(value: string): value is TrainingTestStatus {
  return TRAINING_TEST_STATUSES.includes(value as TrainingTestStatus);
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function resolveTimeLimit(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) {
    return undefined;
  }
  return Math.round(parsed);
}

function getUserName(firstName?: string, lastName?: string, fallback?: string) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || fallback || 'Unknown User';
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
