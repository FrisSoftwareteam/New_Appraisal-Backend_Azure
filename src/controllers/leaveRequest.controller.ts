import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import LeaveRequest, { ILeaveRequest, LeaveType, LEAVE_TYPES } from '../models/LeaveRequest';
import AttendanceException from '../models/AttendanceException';
import User from '../models/User';
import {
  notifyLeaveSubmitted,
  notifyLeaveApprovalNeeded,
  notifyLeaveStepApproved,
  notifyLeaveRejected,
  notifyReturnFromLeaveSubmitted,
  notifyReturnFromLeaveReviewed,
} from '../services/email.service';
import { applyLeaveApprovalToBalance, refundLeaveDaysForEarlyReturn } from '../services/salary.service';
import { createNotification } from './notification.controller';
import { isValidDateKey } from '../utils/attendance-metrics';
import { getTodayDateKey } from '../services/attendance.service';

const HR_ROLES = ['hr_admin', 'super_admin'];

function resolvesAutoStep(approverRole: string | null | undefined, userRole: string): boolean {
  const role = approverRole ?? 'hr_admin'; // pre-migration docs predate this field and always meant HR
  return role === 'hr_admin' ? HR_ROLES.includes(userRole) : userRole === role;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual_leave: 'Annual Leave',
  casual_leave: 'Casual Leave',
  compassionate_leave: 'Compassionate Leave',
  maternity_leave: 'Maternity Leave',
  exam_leave: 'Exam Leave',
  leave_of_absence: 'Leave of Absence',
};

interface ApprovalChainInput {
  reliefOfficerId?: string;
  supervisorId?: string;
  deptHeadId?: string;
  divisionHeadId?: string;
  groupHeadId?: string;
}

 async function buildApprovalChain(leaveType: LeaveType, data: ApprovalChainInput) {
  const userIds = [
    data.reliefOfficerId,
    data.supervisorId,
    data.deptHeadId,
    data.divisionHeadId,
    data.groupHeadId,
  ].filter(Boolean) as string[];

  const users = await User.find({ _id: { $in: userIds } }).select('_id firstName lastName').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), `${u.firstName} ${u.lastName}`]));

  const missingIds = userIds.filter(id => !userMap.has(id));
  if (missingIds.length > 0) {
    throw Object.assign(new Error(`One or more selected approvers could not be found`), { statusCode: 400 });
  }

  const getName = (id: string | undefined) => {
    if (!id) return '';
    return userMap.get(id) || 'Unknown';
  };

  const step = (label: string, id: string | null, approverRole: string | null = null) => ({
    label, approverId: id, approverName: id ? getName(id) : label, approverRole: id ? null : approverRole, status: 'pending' as const,
  });

  const hrStep = step('HR Admin', null, 'hr_admin');
  const hocsStep = step('Head of Corporate Services', null, 'head_of_corporate_services');
  const ceoStep = step('CEO', null, 'ceo');

  if (leaveType === 'leave_of_absence') {
    return [hrStep, hocsStep, ceoStep];
  }

  if (!data.reliefOfficerId) {
    throw new Error('Every leave application requires a Relief Officer');
  }

  const steps = [step('Relief Officer', data.reliefOfficerId)];

  if (leaveType === 'annual_leave') {
    if (data.supervisorId)   steps.push(step('Supervisor', data.supervisorId));
    if (data.deptHeadId)     steps.push(step('Head of Department', data.deptHeadId));
    if (data.divisionHeadId) steps.push(step('Head of Division', data.divisionHeadId));
    if (data.groupHeadId)    steps.push(step('Group Head', data.groupHeadId));
    steps.push(hrStep, hocsStep, ceoStep);
    return steps;
  }

  // All other leave types: Casual, Compassionate, Maternity, Exam
  if (data.supervisorId) steps.push(step('Supervisor', data.supervisorId));
  if (!data.deptHeadId) {
    throw new Error('This leave type requires a Department Head');
  }
  steps.push(step('Head of Department', data.deptHeadId));
  steps.push(hrStep, hocsStep, ceoStep);

  return steps;
}

export const createLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const {
      leaveType,
      startDateKey,
      endDateKey,
      reason,
      leaveAllowance,
      reliefOfficerId,
      supervisorId,
      deptHeadId,
      divisionHeadId,
      groupHeadId,
    } = req.body;

    if (!leaveType || !startDateKey || !endDateKey || !reason || !leaveAllowance) {
      return res.status(400).json({ message: 'Leave type, dates, reason, and allowance are required' });
    }

    if (!LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({ message: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}` });
    }

    if (startDateKey > endDateKey) {
      return res.status(400).json({ message: 'Start date must be on or before end date' });
    }

    const overlap = await LeaveRequest.findOne({
      applicantId: user._id,
      status: { $in: ['pending', 'approved'] },
      startDateKey: { $lte: endDateKey },
      endDateKey: { $gte: startDateKey },
    });

    if (overlap) {
      return res.status(409).json({ message: 'You already have a pending or approved leave request for overlapping dates' });
    }

    const approvalSteps = await buildApprovalChain(leaveType, {
      reliefOfficerId,
      supervisorId,
      deptHeadId,
      divisionHeadId,
      groupHeadId,
    });

    const leaveRequest = await LeaveRequest.create({
      applicantId: user._id,
      applicantName: `${user.firstName} ${user.lastName}`,
      department: user.department,
      division: user.division,
      leaveType,
      startDateKey,
      endDateKey,
      reason,
      leaveAllowance,
      approvalSteps,
      currentStep: 0,
      status: 'pending',
    });

    const applicantName = `${user.firstName} ${user.lastName}`;
    const firstStep = approvalSteps[0];

    notifyLeaveSubmitted(user.email, applicantName, leaveType, startDateKey, endDateKey, firstStep.approverName).catch(() => {});

    if (firstStep.approverId) {
      const firstApprover = await User.findById(firstStep.approverId).select('email firstName lastName').lean();
      if (firstApprover?.email) {
        notifyLeaveApprovalNeeded(
          firstApprover.email, `${firstApprover.firstName} ${firstApprover.lastName}`,
          applicantName, leaveType, startDateKey, endDateKey, firstStep.label, reason,
        ).catch(() => {});
      }
    }

    res.status(201).json(leaveRequest);
  } catch (error: any) {
    console.error('Error creating leave request:', error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || 'Error creating leave request' });
  }
};

export const getMyLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await LeaveRequest.find({ applicantId: req.user!._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(requests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ message: 'Error fetching leave requests' });
  }
};

export const cancelLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      applicantId: req.user!._id,
      status: 'pending',
    });

    if (!request) {
      return res.status(404).json({ message: 'Pending leave request not found' });
    }

    request.status = 'cancelled';
    await request.save();

    res.json({ message: 'Leave request cancelled' });
  } catch (error) {
    console.error('Error cancelling leave request:', error);
    res.status(500).json({ message: 'Error cancelling leave request' });
  }
};

export const getMyPendingApprovals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id.toString();

    const query: any = { status: 'pending' };

    const requests = await LeaveRequest.find(query).sort({ createdAt: -1 }).lean();

    const pending = requests.filter((r) => {
      const step = r.approvalSteps[r.currentStep];
      if (!step || step.status !== 'pending') return false;

      if (step.approverId === null) {
        return resolvesAutoStep(step.approverRole, req.user!.role);
      }
      return step.approverId?.toString() === userId;
    });

    res.json(pending);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ message: 'Error fetching pending approvals' });
  }
};

export const actOnLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { decision, comment } = req.body;
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be "approved" or "rejected"' });
    }

    const request = await LeaveRequest.findOne({ _id: req.params.id, status: 'pending' });
    if (!request) {
      return res.status(404).json({ message: 'Pending leave request not found' });
    }

    const step = request.approvalSteps[request.currentStep];
    if (!step || step.status !== 'pending') {
      return res.status(400).json({ message: 'No pending step to act on' });
    }

    const userId = req.user!._id.toString();
    const isAssigned = step.approverId === null
      ? resolvesAutoStep(step.approverRole, req.user!.role)
      : step.approverId?.toString() === userId;

    if (!isAssigned) {
      return res.status(403).json({ message: 'You are not the assigned approver for this step' });
    }

    step.status = decision;
    step.comment = comment || undefined;
    step.actionAt = new Date();

    if (step.approverId === null) {
      step.approverName = `${req.user!.firstName} ${req.user!.lastName}`;
      step.approverId = req.user!._id;
    }

    if (decision === 'rejected') {
      request.status = 'rejected';
      await request.save();

      const applicant = await User.findById(request.applicantId).select('email firstName lastName').lean();
      if (applicant?.email) {
        notifyLeaveRejected(
          applicant.email, `${applicant.firstName} ${applicant.lastName}`,
          `${req.user!.firstName} ${req.user!.lastName}`, step.label, comment,
        ).catch(() => {});
      }

      return res.json({ message: 'Leave request rejected', request });
    }

    const isLastStep = request.currentStep >= request.approvalSteps.length - 1;

    if (isLastStep) {
      request.status = 'approved';

      const exception = await AttendanceException.create({
        title: `${LEAVE_TYPE_LABELS[request.leaveType]} - ${request.applicantName}`,
        type: request.leaveType,
        scope: 'individual',
        status: 'approved',
        startDateKey: request.startDateKey,
        endDateKey: request.endDateKey,
        userId: request.applicantId,
        userName: request.applicantName,
        notes: request.reason.slice(0, 600),
        createdById: req.user!._id,
        createdByName: `${req.user!.firstName} ${req.user!.lastName}`,
        reviewedById: req.user!._id,
        reviewedByName: `${req.user!.firstName} ${req.user!.lastName}`,
        reviewedAt: new Date(),
      });

      request.exceptionId = exception._id as any;

      try {
        await applyLeaveApprovalToBalance(request);
      } catch (balanceError) {
        console.error('Error applying leave approval to balance:', balanceError);
      }
    } else {
      request.currentStep += 1;
    }

    await request.save();

    const applicant = await User.findById(request.applicantId).select('email firstName lastName').lean();
    const approverFullName = `${req.user!.firstName} ${req.user!.lastName}`;

    if (applicant?.email) {
      const nextStepLabel = !isLastStep ? request.approvalSteps[request.currentStep]?.label : undefined;
      notifyLeaveStepApproved(
        applicant.email, `${applicant.firstName} ${applicant.lastName}`,
        step.label, approverFullName, isLastStep, nextStepLabel,
      ).catch(() => {});
    }

    if (!isLastStep) {
      const nextStep = request.approvalSteps[request.currentStep];
      if (nextStep?.approverId) {
        const nextApprover = await User.findById(nextStep.approverId).select('email firstName lastName').lean();
        if (nextApprover?.email) {
          notifyLeaveApprovalNeeded(
            nextApprover.email, `${nextApprover.firstName} ${nextApprover.lastName}`,
            request.applicantName, request.leaveType, request.startDateKey, request.endDateKey,
            nextStep.label, request.reason,
          ).catch(() => {});
        }
      } else if (nextStep && nextStep.approverId === null) {
        const role = nextStep.approverRole ?? 'hr_admin';
        const roleFilter = role === 'hr_admin' ? HR_ROLES : [role];
        const recipients = await User.find({ role: { $in: roleFilter } }).select('email firstName lastName').lean();
        for (const recipient of recipients) {
          if (recipient.email) {
            notifyLeaveApprovalNeeded(
              recipient.email, `${recipient.firstName} ${recipient.lastName}`,
              request.applicantName, request.leaveType, request.startDateKey, request.endDateKey,
              nextStep.label, request.reason,
            ).catch(() => {});
          }
        }
      }
    }

    res.json({ message: isLastStep ? 'Leave request approved' : 'Step approved, moved to next approver', request });
  } catch (error) {
    console.error('Error acting on leave request:', error);
    res.status(500).json({ message: 'Error processing leave request action' });
  }
};

export const getAllLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!HR_ROLES.includes(req.user!.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { status, leaveType, startDate, endDate, returnStatus } = req.query;
    const query: any = {};

    if (status && status !== 'all') query.status = status;
    if (leaveType && leaveType !== 'all') query.leaveType = leaveType;
    if (returnStatus && returnStatus !== 'all') query.returnStatus = returnStatus;
    if (startDate) query.startDateKey = { $gte: startDate };
    if (endDate) query.endDateKey = { ...query.endDateKey, $lte: endDate };

    const requests = await LeaveRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(requests);
  } catch (error) {
    console.error('Error fetching all leave requests:', error);
    res.status(500).json({ message: 'Error fetching leave requests' });
  }
};

export const markLeaveReturned = async (req: AuthRequest, res: Response) => {
  try {
    const { actualReturnDateKey } = req.body;
    const returnDateKey =
      typeof actualReturnDateKey === 'string' && actualReturnDateKey.trim()
        ? actualReturnDateKey.trim()
        : getTodayDateKey();

    if (!isValidDateKey(returnDateKey)) {
      return res.status(400).json({ message: 'actualReturnDateKey must be a valid YYYY-MM-DD date' });
    }

    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      applicantId: req.user!._id,
      status: 'approved',
      leaveType: 'annual_leave',
      returnStatus: { $in: ['not_marked', 'rejected'] },
    });

    if (!request) {
      return res.status(404).json({ message: 'No eligible approved annual leave request found for this action' });
    }

    if (returnDateKey < request.startDateKey) {
      return res.status(400).json({ message: 'Return date cannot be before the leave start date' });
    }

    request.returnStatus = 'pending_confirmation';
    request.actualReturnDateKey = returnDateKey;
    request.returnMarkedAt = new Date();
    request.returnReviewedById = undefined;
    request.returnReviewedByName = undefined;
    request.returnReviewedAt = undefined;
    request.returnReviewNote = undefined;
    request.daysRefunded = undefined;
    await request.save();

    const applicantName = request.applicantName;
    const hrRecipients = await User.find({ role: { $in: HR_ROLES } }).select('email firstName lastName').lean();
    for (const hr of hrRecipients) {
      if (hr.email) {
        notifyReturnFromLeaveSubmitted(
          hr.email, `${hr.firstName} ${hr.lastName}`,
          applicantName, request.startDateKey, request.endDateKey, returnDateKey,
        ).catch(() => {});
      }
      createNotification(
        String(hr._id),
        'Return from leave pending confirmation',
        `${applicantName} marked themselves as returned from leave (claimed ${returnDateKey}).`,
        'info',
        '/leave',
      ).catch(() => {});
    }

    res.json({ message: 'Return marked, awaiting HR confirmation', request });
  } catch (error) {
    console.error('Error marking leave return:', error);
    res.status(500).json({ message: 'Error marking leave return' });
  }
};

export const reviewLeaveReturn = async (req: AuthRequest, res: Response) => {
  try {
    if (!HR_ROLES.includes(req.user!.role)) {
      return res.status(403).json({ message: 'Only HR Admin or Super Admin can review a leave return' });
    }

    const { decision, reviewNote } = req.body;
    if (decision !== 'confirmed' && decision !== 'rejected') {
      return res.status(400).json({ message: 'Decision must be "confirmed" or "rejected"' });
    }

    const request = await LeaveRequest.findOne({ _id: req.params.id, returnStatus: 'pending_confirmation' });
    if (!request) {
      return res.status(404).json({ message: 'No pending return confirmation found for this request' });
    }

    request.returnStatus = decision;
    request.returnReviewedById = req.user!._id;
    request.returnReviewedByName = `${req.user!.firstName} ${req.user!.lastName}`;
    request.returnReviewedAt = new Date();
    request.returnReviewNote = typeof reviewNote === 'string' && reviewNote.trim() ? reviewNote.trim() : undefined;

    let daysRefunded = 0;
    if (decision === 'confirmed' && request.actualReturnDateKey) {
      try {
        daysRefunded = await refundLeaveDaysForEarlyReturn(request, request.actualReturnDateKey);
      } catch (refundError) {
        console.error('Error refunding early-return leave days:', refundError);
      }
      request.daysRefunded = daysRefunded;

      if (daysRefunded > 0 && request.exceptionId) {
        const lastLeaveDay = new Date(`${request.actualReturnDateKey}T00:00:00.000Z`);
        lastLeaveDay.setUTCDate(lastLeaveDay.getUTCDate() - 1);
        const shortenedEndDateKey = lastLeaveDay.toISOString().slice(0, 10);
        await AttendanceException.findByIdAndUpdate(request.exceptionId, { endDateKey: shortenedEndDateKey });
      }
    }

    await request.save();

    const applicant = await User.findById(request.applicantId).select('email firstName lastName').lean();
    const reviewerName = `${req.user!.firstName} ${req.user!.lastName}`;
    if (applicant?.email) {
      notifyReturnFromLeaveReviewed(
        applicant.email, `${applicant.firstName} ${applicant.lastName}`,
        decision, reviewerName, request.returnReviewNote, daysRefunded,
      ).catch(() => {});
    }
    createNotification(
      String(request.applicantId),
      decision === 'confirmed' ? 'Return from leave confirmed' : 'Return from leave not confirmed',
      decision === 'confirmed'
        ? `Your return from leave was confirmed by ${reviewerName}.${daysRefunded > 0 ? ` ${daysRefunded} day(s) credited back to your balance.` : ''}`
        : `Your return from leave was not confirmed by ${reviewerName}.${request.returnReviewNote ? ` Note: ${request.returnReviewNote}` : ''}`,
      decision === 'confirmed' ? 'success' : 'warning',
      '/leave',
    ).catch(() => {});

    res.json({ message: decision === 'confirmed' ? 'Return confirmed' : 'Return not confirmed', request });
  } catch (error) {
    console.error('Error reviewing leave return:', error);
    res.status(500).json({ message: 'Error reviewing leave return' });
  }
};
