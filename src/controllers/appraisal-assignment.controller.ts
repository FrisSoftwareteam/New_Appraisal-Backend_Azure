import { Request, Response } from 'express';
import Appraisal from '../models/Appraisal';
import AppraisalFlow from '../models/AppraisalFlow';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';

// Get assignments for an appraisal
export const getAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const appraisal = await Appraisal.findById(id)
      .populate('workflow')
      .populate('stepAssignments.assignedUser', 'firstName lastName email role avatar');
      
    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    // If stepAssignments is empty (legacy or new), try to resolve them
    if (!appraisal.stepAssignments || appraisal.stepAssignments.length === 0) {
       // This logic might be better placed in a service or shared helper
       // For now, we return what we have, or maybe trigger a resolution
    }

    res.status(200).json(appraisal.stepAssignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
};

// Update assignments for an appraisal
export const updateAssignments = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { assignments } = req.body; // Array of { stepId, assignedUserId }

    const appraisal = await Appraisal.findById(id);
    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    // Validate permissions (HR or Admin)
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'hr_admin') {
      return res.status(403).json({ message: 'Not authorized to update assignments' });
    }

    // Update assignments
    // We iterate through the provided assignments and update the matching step in the appraisal
    assignments.forEach((update: { stepId: string, assignedUserId: string }) => {
      const existingAssignmentIndex = appraisal.stepAssignments.findIndex(
        sa => sa.stepId === update.stepId
      );

      if (existingAssignmentIndex >= 0) {
        appraisal.stepAssignments[existingAssignmentIndex].assignedUser = update.assignedUserId as any;
      } else {
        // Should not happen if initialized correctly, but handle anyway
        appraisal.stepAssignments.push({
          stepId: update.stepId,
          assignedUser: update.assignedUserId as any,
          status: 'pending'
        });
      }
    });

    await appraisal.save();
    
    // Return updated assignments with population
    const updatedAppraisal = await Appraisal.findById(id)
      .populate('stepAssignments.assignedUser', 'firstName lastName email role avatar');

    res.status(200).json(updatedAppraisal?.stepAssignments);
  } catch (error) {
    console.error('Error updating assignments:', error);
    res.status(500).json({ message: 'Error updating assignments' });
  }
};
