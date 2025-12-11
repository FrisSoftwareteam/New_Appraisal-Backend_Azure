import { Request, Response } from 'express';
import Appraisal from '../models/Appraisal';
import { AuthRequest } from '../middleware/auth.middleware';
import { createAuditLog } from './audit.controller';

// Get appraisal with appropriate version based on user role
export const getAppraisalForUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const appraisal = await Appraisal.findById(id)
      .select('+reviews') // Explicitly include reviews
      .populate('employee', 'firstName lastName email department division grade role')
      .populate('template')
      .populate('workflow')
      .populate('history.actor', 'firstName lastName')
      .populate('adminEditedVersion.editedBy', 'firstName lastName')
      .populate('adminEditedVersion.editHistory.editor', 'firstName lastName')
      .populate('reviews.reviewerId', 'firstName lastName email')
      .populate('adminEditedVersion.reviews.reviewerId', 'firstName lastName email');

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    console.log('=== BACKEND: getAppraisalForUser ===');
    console.log('Appraisal ID:', id);
    console.log('Reviews count:', appraisal.reviews?.length || 0);
    console.log('Admin edited version reviews count:', appraisal.adminEditedVersion?.reviews?.length || 0);
    console.log('Template questions count:', (appraisal.template as any)?.questions?.length || 0);
    console.log('Employee division:', (appraisal.employee as any)?.division);
    console.log('Employee role:', (appraisal.employee as any)?.role);

    const isAdmin = ['hr_admin', 'appraisal_committee', 'super_admin'].includes(req.user?.role || '');
    const isEmployee = req.user?._id?.toString() === appraisal.employee._id.toString();
    
    // Check if user has permission to view this appraisal
    // Employees can view their own appraisals, admins can view any appraisal
    if (!isEmployee && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to view this appraisal' });
    }

    // Convert to plain object to ensure all nested data is properly serialized
    const appraisalData = appraisal.toObject();

    // If employee (and not also an admin), return original version (hide admin edits)
    if (isEmployee && !isAdmin) {
      const employeeView = {
        ...appraisalData,
        adminEditedVersion: undefined, // Hide admin edits from employees
        isAdminEdited: false
      };
      console.log('Returning employee view (reviews hidden from admin edits)');
      return res.json(employeeView);
    }

    // If admin, return with admin version if it exists
    console.log('Returning admin view with all data');
    res.json(appraisalData);
  } catch (error) {
    console.error('Error fetching appraisal:', error);
    res.status(500).json({ message: 'Error fetching appraisal', error });
  }
};

// Update appraisal with admin edits (post-completion)
export const updateAdminVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reviews, overallScore, finalComments } = req.body;

    // Permission check
    const isAuthorized = ['hr_admin', 'appraisal_committee', 'super_admin'].includes(req.user?.role || '');
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Only HR Admins and Appraisal Committee can edit completed appraisals' });
    }

    const appraisal = await Appraisal.findById(id);
    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    // Only allow editing if appraisal is completed
    if (appraisal.status !== 'completed') {
      return res.status(400).json({ message: 'Can only edit completed appraisals' });
    }

    // Track changes for audit
    const changes: any[] = [];
    
    if (reviews) {
      changes.push({
        field: 'reviews',
        oldValue: appraisal.adminEditedVersion?.reviews || appraisal.reviews,
        newValue: reviews
      });
    }
    
    if (overallScore !== undefined) {
      changes.push({
        field: 'overallScore',
        oldValue: appraisal.adminEditedVersion?.overallScore || appraisal.overallScore,
        newValue: overallScore
      });
    }
    
    if (finalComments !== undefined) {
      changes.push({
        field: 'finalComments',
        oldValue: appraisal.adminEditedVersion?.finalComments || appraisal.finalComments,
        newValue: finalComments
      });
    }

    // Initialize adminEditedVersion if it doesn't exist
    if (!appraisal.adminEditedVersion) {
      appraisal.adminEditedVersion = {
        reviews: appraisal.reviews,
        overallScore: appraisal.overallScore,
        finalComments: appraisal.finalComments,
        editedBy: req.user!._id,
        editedAt: new Date(),
        editHistory: []
      } as any;
    }

    // Update admin version (safe to access after initialization above)
    if (reviews) appraisal.adminEditedVersion!.reviews = reviews;
    if (overallScore !== undefined) appraisal.adminEditedVersion!.overallScore = overallScore;
    if (finalComments !== undefined) appraisal.adminEditedVersion!.finalComments = finalComments;
    
    appraisal.adminEditedVersion!.editedBy = req.user!._id;
    appraisal.adminEditedVersion!.editedAt = new Date();
    
    // Add to edit history
    appraisal.adminEditedVersion!.editHistory.push({
      editor: req.user!._id,
      timestamp: new Date(),
      changes
    } as any);

    appraisal.isAdminEdited = true;

    // Add to appraisal history
    appraisal.history.push({
      action: 'admin_edit',
      actor: req.user!._id,
      timestamp: new Date(),
      comment: 'Admin edited completed appraisal for reporting'
    } as any);

    await appraisal.save();

    // Audit log
    await createAuditLog(
      req.user!._id.toString(),
      'appraisal_admin_edit',
      'appraisal',
      appraisal._id.toString(),
      `Admin edited completed appraisal for ${appraisal.employee}`,
      undefined,
      { changes }
    );

    res.json(appraisal);
  } catch (error) {
    console.error('Error updating admin version:', error);
    res.status(500).json({ message: 'Error updating appraisal', error });
  }
};

// Get edit history for an appraisal
export const getEditHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const appraisal = await Appraisal.findById(id)
      .populate('adminEditedVersion.editHistory.editor', 'firstName lastName email role');

    if (!appraisal) {
      return res.status(404).json({ message: 'Appraisal not found' });
    }

    res.json(appraisal.adminEditedVersion?.editHistory || []);
  } catch (error) {
    console.error('Error fetching edit history:', error);
    res.status(500).json({ message: 'Error fetching edit history', error });
  }
};
