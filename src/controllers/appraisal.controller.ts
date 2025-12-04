import { Request, Response } from 'express';
import Appraisal from '../models/Appraisal';
import AppraisalTemplate from '../models/AppraisalTemplate';
import AppraisalFlow from '../models/AppraisalFlow';
import AppraisalPeriod from '../models/AppraisalPeriod';
import User from '../models/User';
import PeriodStaffAssignment from '../models/PeriodStaffAssignment';
import { AuthRequest } from '../middleware/auth.middleware';

// Initiate an appraisal for an employee
export const initiateAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, templateId, workflowId, period, assignments } = req.body;

    // Verify existence
    const employee = await User.findById(employeeId);
    const template = await AppraisalTemplate.findById(templateId);
    const appraisalFlow = await AppraisalFlow.findById(workflowId);

    if (!employee || !template || !appraisalFlow) {
      return res.status(404).json({ message: 'Employee, Template, or Workflow not found' });
    }

    // Check if appraisal already exists for this period
    const existingAppraisal = await Appraisal.findOne({
      employee: employeeId,
      period,
      status: { $ne: 'completed' }
    });

    if (existingAppraisal) {
      return res.status(400).json({ message: 'Active appraisal already exists for this period' });
    }

    // Resolve step assignments
    const stepAssignments = appraisalFlow.steps.map((step: any) => {
      const stepId = step._id || step.id;
      
      // Check if there's a manual assignment from the wizard
      const manualAssignment = assignments?.find((a: any) => a.stepId === stepId.toString());
      
      let assignedUser = null;
      if (manualAssignment && manualAssignment.assignedUserId !== 'auto') {
        // Use manual assignment from wizard
        assignedUser = manualAssignment.assignedUserId;
      } else {
        // Auto-assign based on role
        if (step.assignedRole === 'employee') {
          assignedUser = employee._id;
        } else if (step.assignedRole === 'supervisor') {
          assignedUser = employee.supervisor;
        }
      }
      
      return {
        stepId: stepId.toString(),
        assignedUser: assignedUser,
        status: 'pending'
      };
    });

    const appraisal = new Appraisal({
      employee: employeeId,
      template: templateId,
      workflow: workflowId,
      period,
      status: 'in_progress',
      currentStep: 0,
      stepAssignments,
      reviews: [],
      history: [{
        action: 'initiated',
        actor: req.user?._id,
        comment: 'Appraisal cycle initiated'
      }]
    });

    await appraisal.save();
    
    // Update PeriodStaffAssignment to mark as initialized
    // Find the period by name to get its ObjectId
    const periodDoc = await AppraisalPeriod.findOne({ name: period });
    if (periodDoc) {
      await PeriodStaffAssignment.updateOne(
        { 
          employee: employeeId,
          period: periodDoc._id
        },
        { 
          isInitialized: true,
          workflow: workflowId,
          template: templateId
        }
      );
    }
    
    res.status(201).json(appraisal);
  } catch (error) {
    console.error('Error initiating appraisal:', error);
    res.status(500).json({ message: 'Error initiating appraisal', error });
  }
};

// Submit Review (Generic for any step)
export const submitReview = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { stepId, responses, overallScore, comments } = req.body;

    const appraisal = await Appraisal.findById(id).populate('workflow');
    if (!appraisal) return res.status(404).json({ message: 'Appraisal not found' });

    // Find the step in the workflow to verify rank/order
    const workflow: any = appraisal.workflow;
    const currentStepConfig = workflow.steps.find((s: any) => (s._id || s.id).toString() === stepId);
    
    if (!currentStepConfig) {
      return res.status(400).json({ message: 'Invalid step ID' });
    }

    // Verify it's the current step (optional, but good for enforcement)
    // For now, we allow submitting if it's the assigned user
    
    // Check assignment
    const assignment = appraisal.stepAssignments.find(sa => sa.stepId === stepId);
    if (!assignment) {
      return res.status(400).json({ message: 'Step assignment not found' });
    }

    // Verify user is the assigned user (or admin)
    if (assignment.assignedUser?.toString() !== req.user?._id?.toString() && req.user?.role !== 'super_admin') {
       return res.status(403).json({ message: 'You are not assigned to this step' });
    }

    // Update or add review
    const reviewIndex = appraisal.reviews.findIndex(r => r.stepId === stepId);
    const reviewData = {
      stepId,
      reviewerId: req.user?._id,
      reviewerRole: req.user?.role,
      responses,
      overallScore,
      comments,
      submittedAt: new Date(),
      status: 'completed'
    };

    if (reviewIndex >= 0) {
      appraisal.reviews[reviewIndex] = reviewData as any;
    } else {
      appraisal.reviews.push(reviewData as any);
    }

    // Update assignment status
    assignment.status = 'completed';

    // Check if we should move to next step
    // If this was the current step, increment
    // Logic: Find rank of current step, find next rank
    const currentRank = currentStepConfig.rank;
    const nextStep = workflow.steps.find((s: any) => s.rank > currentRank); // Simplified: assumes sorted ranks

    // Special Logic: If Step 1 (index 0) was completed by someone OTHER than the employee,
    // and the next step is NOT the employee, we must pause for Employee Acceptance.
    const isFirstStep = appraisal.currentStep === 0;
    const isReviewerEmployee = req.user?._id?.toString() === appraisal.employee.toString();
    
    // Check if next step is assigned to employee
    let nextStepIsEmployee = false;
    if (nextStep) {
       // We need to check the assignment for the next step to be sure
       const nextStepId = nextStep._id || nextStep.id;
       const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
       if (nextAssignment && nextAssignment.assignedUser?.toString() === appraisal.employee.toString()) {
         nextStepIsEmployee = true;
       }
    }

    if (isFirstStep && !isReviewerEmployee && !nextStepIsEmployee) {
      // Pause for Employee Acceptance
      appraisal.status = 'pending_employee_review';
      
      appraisal.history.push({
        action: 'pending_acceptance',
        actor: req.user?._id!,
        timestamp: new Date(),
        comment: 'Appraisal paused for Employee Acceptance'
      });
    } else if (nextStep) {
      appraisal.currentStep = appraisal.currentStep + 1; // Or set based on index
      appraisal.status = 'in_progress';
      
      // Update next step status to in_progress? Optional, but good for UI
      const nextStepId = nextStep._id || nextStep.id;
      const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
      if (nextAssignment) {
        nextAssignment.status = 'in_progress';
      }
    } else {
      appraisal.status = 'completed';
    }

    appraisal.history.push({
      action: 'review_submitted',
      actor: req.user?._id!,
      timestamp: new Date(),
      comment: `Review submitted for step: ${currentStepConfig.name}`
    });

    // Clear any previous rejection reason
    appraisal.rejectionReason = undefined;

    await appraisal.save();
    res.json(appraisal);
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Error submitting review', error });
  }
};

// Reject Appraisal (Request Changes)
export const rejectAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const appraisal = await Appraisal.findById(id).populate('workflow');
    if (!appraisal) return res.status(404).json({ message: 'Appraisal not found' });

    if (appraisal.status === 'pending_employee_review') {
      // Employee rejected the manager's review
      // Move back to the previous step (which is currentStep, since we didn't increment)
      // We need to reset the status of the current step assignment to 'in_progress' or 'pending'
      // so the manager can edit it.
      
      appraisal.status = 'in_progress';
      
      const workflow: any = appraisal.workflow;
      const currentStepConfig = workflow.steps[appraisal.currentStep];
      const currentStepId = currentStepConfig._id || currentStepConfig.id;
      
      const assignment = appraisal.stepAssignments.find(sa => sa.stepId === currentStepId.toString());
      if (assignment) {
        assignment.status = 'in_progress'; // Re-open for manager
      }
      
      // Also maybe clear the review? Or keep it as history?
      // For now, we keep it, but the manager will overwrite it on next submit.
      
      appraisal.history.push({
        action: 'rejected_by_employee',
        actor: req.user?._id!,
        timestamp: new Date(),
        comment: `Employee rejected review: ${reason}`
      });
      
      appraisal.rejectionReason = reason;

    } else {
      // Standard rejection (e.g. Manager rejects Employee self-appraisal, or HR rejects Manager)
      // Logic to move back a step
      if (appraisal.currentStep > 0) {
         appraisal.currentStep = appraisal.currentStep - 1;
         
         // Reset previous step assignment
         const workflow: any = appraisal.workflow;
         const prevStepConfig = workflow.steps[appraisal.currentStep];
         const prevStepId = prevStepConfig._id || prevStepConfig.id;
         
         const assignment = appraisal.stepAssignments.find(sa => sa.stepId === prevStepId.toString());
         if (assignment) {
           assignment.status = 'in_progress';
         }
      }
      
      appraisal.history.push({
        action: 'rejected',
        actor: req.user?._id!,
        timestamp: new Date(),
        comment: `Appraisal returned: ${reason}`
      });
    }

    await appraisal.save();
    res.json(appraisal);
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting appraisal', error });
  }
};

// Accept Appraisal (Final Sign-off or Intermediate Acceptance)
export const acceptAppraisal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const appraisal = await Appraisal.findById(id).populate('workflow');
    if (!appraisal) return res.status(404).json({ message: 'Appraisal not found' });

    // Verify user is the employee
    if (req.user?._id?.toString() !== appraisal.employee.toString() && req.user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the employee can accept the appraisal' });
    }

    if (appraisal.status === 'pending_employee_review') {
      // Intermediate acceptance: Move to next step
      appraisal.status = 'in_progress';
      appraisal.currentStep = appraisal.currentStep + 1;
      
      // Update next step status
      const workflow: any = appraisal.workflow;
      // We assume currentStep was NOT incremented when it went to pending_employee_review
      // So now we increment it.
      // We need to find the next step to set its status
      if (workflow && workflow.steps[appraisal.currentStep]) {
         const nextStep = workflow.steps[appraisal.currentStep];
         const nextStepId = nextStep._id || nextStep.id;
         const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
         if (nextAssignment) {
           nextAssignment.status = 'in_progress';
         }
      }

      appraisal.history.push({
        action: 'accepted_intermediate',
        actor: req.user?._id!,
        timestamp: new Date(),
        comment: 'Employee accepted the appraisal review'
      });

    } else {
      // Final acceptance
      appraisal.status = 'completed';
      
      appraisal.history.push({
        action: 'accepted_final',
        actor: req.user?._id!,
        timestamp: new Date(),
        comment: 'Appraisal accepted/finalized'
      });
    }

    await appraisal.save();
    res.json(appraisal);
  } catch (error) {
    res.status(500).json({ message: 'Error accepting appraisal', error });
  }
};

// Get Appraisal by ID
export const getAppraisalById = async (req: Request, res: Response) => {
  try {
    const appraisal = await Appraisal.findById(req.params.id)
      .populate('employee', 'firstName lastName email department')
      .populate('template')
      .populate('workflow')
      .populate('history.actor', 'firstName lastName');

    if (!appraisal) return res.status(404).json({ message: 'Appraisal not found' });
    res.json(appraisal);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching appraisal', error });
  }
};

// Get Appraisals for User (My Appraisals)
export const getMyAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    const appraisals = await Appraisal.find({ employee: req.user?._id })
      .populate('employee', 'firstName lastName email department division grade role')
      .populate('template')
      .populate('workflow')
      .sort({ createdAt: -1 });
    res.json(appraisals);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching appraisals', error });
  }
};

// Get Pending Appraisals (For Managers/Appraisers)
// This logic needs to be robust to find appraisals where the current user is the "manager"
// For now, we'll assume the user is a supervisor and find employees they supervise
// OR we can look at the workflow.
export const getPendingAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    // Find users who report to this user
    const directReports = await User.find({ supervisor: req.user?._id });
    const reportIds = directReports.map(u => u._id);

    const appraisals = await Appraisal.find({
      employee: { $in: reportIds },
      status: 'manager_appraisal'
    })
    .populate('employee', 'firstName lastName')
    .populate('template', 'name');

    res.json(appraisals);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending appraisals', error });
  }
};

// Get All Appraisals (Admin/HR)
export const getAllAppraisals = async (req: Request, res: Response) => {
  try {
    const appraisals = await Appraisal.find()
      .populate('employee', 'firstName lastName email department')
      .populate('template', 'name')
      .populate('workflow')
      .sort({ createdAt: -1 });
    res.json(appraisals);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all appraisals', error });
  }
};

// Get Appraisals assigned to the current user for review (Active Step)
export const getAssignedAppraisals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    
    // Find appraisals where the user is assigned to a step that is pending or in_progress
    const appraisals = await Appraisal.find({
      'stepAssignments': {
        $elemMatch: {
          assignedUser: userId,
          status: { $in: ['pending', 'in_progress'] }
        }
      },
      status: { $ne: 'completed' }
    })
    .populate('employee', 'firstName lastName email department')
    .populate('template')
    .populate('workflow');

    // Filter to only include appraisals where the *current* step is assigned to this user
    const activeAppraisals = appraisals.filter(appraisal => {
      if (!appraisal.workflow) return false;
      
      const workflow: any = appraisal.workflow;
      // Ensure currentStep is within bounds
      if (appraisal.currentStep >= workflow.steps.length) return false;

      const currentStepId = workflow.steps[appraisal.currentStep]._id || workflow.steps[appraisal.currentStep].id;
      
      // Find the assignment for this step
      const assignment = appraisal.stepAssignments.find(sa => sa.stepId === currentStepId.toString());
      
      return assignment && assignment.assignedUser?.toString() === userId?.toString();
    });

    res.json(activeAppraisals);
  } catch (error) {
    console.error('Error fetching assigned appraisals:', error);
    res.status(500).json({ message: 'Error fetching assigned appraisals', error });
  }
};

// Delete All Appraisals (Admin Cleanup)
export const deleteAllAppraisals = async (req: Request, res: Response) => {
  try {
    const result = await Appraisal.deleteMany({});
    res.status(200).json({ 
      message: 'All appraisals deleted successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all appraisals:', error);
    res.status(500).json({ message: 'Error deleting all appraisals' });
  }
};
