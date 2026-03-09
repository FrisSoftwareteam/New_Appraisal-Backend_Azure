import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import LeaveRequest, { ILeaveRequest, LeaveType } from '../models/LeaveRequest';
import AttendanceException from '../models/AttendanceException';
import User from '../models/User';
import {
  notifyLeaveSubmitted,
  notifyLeaveApprovalNeeded,
  notifyLeaveStepApproved,
  notifyLeaveRejected,
} from '../services/email.service';

const HR_ROLES = ['hr_admin', 'super_admin'];

interface ApprovalChainInput {
  reliefOfficerId?: string;
  deptHeadId: string;
  divisionHeadId?: string;
  groupHeadId?: string;
}

async function buildApprovalChain(leaveType: LeaveType, data: ApprovalChainInput) {
  const userIds = [
    data.reliefOfficerId,
    data.deptHeadId,
    data.divisionHeadId,
    data.groupHeadId,
  ].filter(Boolean) as string[];

  const users = await User.find({ _id: { $in: userIds } }).select('_id firstName lastName').lean();
  const userMap = new Map(users.map(u => [u._id.toString(), `${u.firstName} ${u.lastName}`]));

  const getName = (id: string | undefined) => {
    if (!id) return '';
    return userMap.get(id) || 'Unknown';
  };

  if (leaveType === 'annual_leave') {
    if (!data.reliefOfficerId || !data.deptHeadId || !data.divisionHeadId || !data.groupHeadId) {
      throw new Error('Annual leave requires Relief Officer, Department Head, Division Head, and Group Head');
    }
    return [
      { label: 'Relief Officer', approverId: data.reliefOfficerId, approverName: getName(data.reliefOfficerId), status: 'pending' as const },
      { label: 'Head of Department', approverId: data.deptHeadId, approverName: getName(data.deptHeadId), status: 'pending' as const },
      { label: 'Head of Division', approverId: data.divisionHeadId, approverName: getName(data.divisionHeadId), status: 'pending' as const },
      { label: 'Group Head', approverId: data.groupHeadId, approverName: getName(data.groupHeadId), status: 'pending' as const },
      { label: 'HR Admin', approverId: null, approverName: 'HR Admin', status: 'pending' as const },
    ];
  }

  if (leaveType === 'sick_leave') {
    if (!data.deptHeadId) {
      throw new Error('Sick leave requires Department Head');
    }
    return [
      { label: 'Head of Department', approverId: data.deptHeadId, approverName: getName(data.deptHeadId), status: 'pending' as const },
      { label: 'HR Admin', approverId: null, approverName: 'HR Admin', status: 'pending' as const },
    ];
  }

  throw new Error('Invalid leave type');
}

export const createLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const {
      leaveType,
      startDateKey,
      endDateKey,
      reason,
      reliefOfficerId,
      deptHeadId,
      divisionHeadId,
      groupHeadId,
    } = req.body;

    if (!leaveType || !startDateKey || !endDateKey || !reason) {
      return res.status(400).json({ message: 'Leave type, dates, and reason are required' });
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
    res.status(500).json({ message: error.message || 'Error creating leave request' });
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
    const isHr = HR_ROLES.includes(req.user!.role);

    const query: any = { status: 'pending' };

    const requests = await LeaveRequest.find(query).sort({ createdAt: -1 }).lean();

    const pending = requests.filter((r) => {
      const step = r.approvalSteps[r.currentStep];
      if (!step || step.status !== 'pending') return false;

      if (step.approverId === null) {
        return isHr;
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
    const isHr = HR_ROLES.includes(req.user!.role);
    const isAssigned = step.approverId === null ? isHr : step.approverId?.toString() === userId;

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
        title: `${request.leaveType === 'annual_leave' ? 'Annual' : 'Sick'} Leave - ${request.applicantName}`,
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
        const hrAdmins = await User.find({ role: { $in: ['hr_admin', 'super_admin'] } }).select('email firstName lastName').lean();
        for (const hr of hrAdmins) {
          if (hr.email) {
            notifyLeaveApprovalNeeded(
              hr.email, `${hr.firstName} ${hr.lastName}`,
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

    const { status, leaveType, startDate, endDate } = req.query;
    const query: any = {};

    if (status && status !== 'all') query.status = status;
    if (leaveType && leaveType !== 'all') query.leaveType = leaveType;
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
