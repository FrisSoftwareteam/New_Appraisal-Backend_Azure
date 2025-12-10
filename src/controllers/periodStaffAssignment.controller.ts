import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import PeriodStaffAssignment from '../models/PeriodStaffAssignment';
import AppraisalPeriod from '../models/AppraisalPeriod';
import User from '../models/User';
import AppraisalFlow from '../models/AppraisalFlow';
import AppraisalTemplate from '../models/AppraisalTemplate';

// Get all staff assignments for a period
export const getPeriodStaffAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.params;
    
    const assignments = await PeriodStaffAssignment.find({ period: periodId })
      .populate('employee', 'firstName lastName email department division grade jobTitle')
      .populate('workflow', 'name description')
      .populate('template', 'name description')
      .populate('workflowAssignedBy', 'firstName lastName')
      .populate('templateAssignedBy', 'firstName lastName');
    
    res.json(assignments);
  } catch (error) {
    console.error('Error fetching period staff assignments:', error);
    res.status(500).json({ message: 'Error fetching staff assignments', error });
  }
};

// Assign staff to a period (creates assignment records)
export const assignStaffToPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.params;
    const { employeeIds } = req.body;
    
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Employee IDs array is required' });
    }
    
    // Verify period exists
    const period = await AppraisalPeriod.findById(periodId);
    if (!period) {
      return res.status(404).json({ message: 'Period not found' });
    }
    
    // Create assignments for each employee
    const assignments = [];
    for (const employeeId of employeeIds) {
      // Check if assignment already exists
      let assignment = await PeriodStaffAssignment.findOne({
        period: periodId,
        employee: employeeId
      });
      
      if (!assignment) {
        assignment = await PeriodStaffAssignment.create({
          period: periodId,
          employee: employeeId,
          workflow: null,
          template: null,
          isInitialized: false
        });
      }
      
      assignments.push(assignment);
    }
    
    // Update period's assignedEmployees array
    period.assignedEmployees = employeeIds;
    await period.save();
    
    res.json({ message: 'Staff assigned successfully', assignments });
  } catch (error) {
    console.error('Error assigning staff to period:', error);
    res.status(500).json({ message: 'Error assigning staff', error });
  }
};

// Assign workflow to staff in a period
export const assignWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { workflowId } = req.body;
    
    if (!workflowId) {
      return res.status(400).json({ message: 'Workflow ID is required' });
    }
    
    // Verify workflow exists
    const workflow = await AppraisalFlow.findById(workflowId);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    
    // Update assignment
    const assignment = await PeriodStaffAssignment.findByIdAndUpdate(
      assignmentId,
      {
        workflow: workflowId,
        workflowAssignedAt: new Date(),
        workflowAssignedBy: req.user!.id
      },
      { new: true }
    ).populate('employee workflow template');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    console.error('Error assigning workflow:', error);
    res.status(500).json({ message: 'Error assigning workflow', error });
  }
};

// Assign template to staff in a period
export const assignTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { templateId } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ message: 'Template ID is required' });
    }
    
    // Verify template exists
    const template = await AppraisalTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    // Update assignment
    const assignment = await PeriodStaffAssignment.findByIdAndUpdate(
      assignmentId,
      {
        template: templateId,
        templateAssignedAt: new Date(),
        templateAssignedBy: req.user!.id
      },
      { new: true }
    ).populate('employee workflow template');
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    res.json(assignment);
  } catch (error) {
    console.error('Error assigning template:', error);
    res.status(500).json({ message: 'Error assigning template', error });
  }
};

// Bulk assign workflow to multiple staff
export const bulkAssignWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.params;
    const { workflowId, employeeIds } = req.body;
    
    if (!workflowId) {
      return res.status(400).json({ message: 'Workflow ID is required' });
    }
    
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Employee IDs array is required' });
    }
    
    // Verify workflow exists
    const workflow = await AppraisalFlow.findById(workflowId);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    
    // Update all assignments
    const result = await PeriodStaffAssignment.updateMany(
      {
        period: periodId,
        employee: { $in: employeeIds }
      },
      {
        workflow: workflowId,
        workflowAssignedAt: new Date(),
        workflowAssignedBy: req.user!.id
      }
    );
    
    res.json({ message: `Workflow assigned to ${result.modifiedCount} staff members`, result });
  } catch (error) {
    console.error('Error bulk assigning workflow:', error);
    res.status(500).json({ message: 'Error bulk assigning workflow', error });
  }
};

// Bulk assign template to multiple staff
export const bulkAssignTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.params;
    const { templateId, employeeIds } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ message: 'Template ID is required' });
    }
    
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Employee IDs array is required' });
    }
    
    // Verify template exists
    const template = await AppraisalTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    // Update all assignments
    const result = await PeriodStaffAssignment.updateMany(
      {
        period: periodId,
        employee: { $in: employeeIds }
      },
      {
        template: templateId,
        templateAssignedAt: new Date(),
        templateAssignedBy: req.user!.id
      }
    );
    
    res.json({ message: `Template assigned to ${result.modifiedCount} staff members`, result });
  } catch (error) {
    console.error('Error bulk assigning template:', error);
    res.status(500).json({ message: 'Error bulk assigning template', error });
  }
};

// Get pending initialization (staff without workflow or template)
export const getPendingInitialization = async (req: AuthRequest, res: Response) => {
  try {
    const { periodId } = req.params;
    
    const pendingAssignments = await PeriodStaffAssignment.find({
      period: periodId,
      isInitialized: false
    })
      .populate('employee', 'firstName lastName email department division grade jobTitle')
      .populate('workflow', 'name')
      .populate('template', 'name');
    
    res.json(pendingAssignments);
  } catch (error) {
    console.error('Error fetching pending initialization:', error);
    res.status(500).json({ message: 'Error fetching pending initialization', error });
  }
};

// Get all pending initializations across all active periods
export const getAllPendingInitializations = async (req: AuthRequest, res: Response) => {
  try {
    // Find all active periods
    const activePeriods = await AppraisalPeriod.find({ status: 'active' }).select('_id name');
    const activePeriodIds = activePeriods.map(p => p._id);
    
    if (activePeriodIds.length === 0) {
      return res.json([]);
    }
    
    // Find all pending assignments for active periods
    // Pending means workflow or template is not assigned (isInitialized: false)
    const pendingAssignments = await PeriodStaffAssignment.find({
      period: { $in: activePeriodIds },
      isInitialized: false
    })
      .populate('period', 'name status startDate endDate')
      .populate('employee', 'firstName lastName email department division grade jobTitle')
      .populate('workflow', 'name description')
      .populate('template', 'name description');
    
    res.json(pendingAssignments);
  } catch (error) {
    console.error('Error fetching all pending initializations:', error);
    res.status(500).json({ message: 'Error fetching all pending initializations', error });
  }
};
