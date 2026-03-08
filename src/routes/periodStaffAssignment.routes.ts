import express from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import * as periodStaffAssignmentController from '../controllers/periodStaffAssignment.controller';

const router = express.Router();

const adminOnly = [authenticate, requirePermission('systemSettings')];

// Get all staff assignments for a period
router.get('/periods/:periodId/assignments', ...adminOnly, periodStaffAssignmentController.getPeriodStaffAssignments);

// Assign staff to a period
router.post('/periods/:periodId/assignments', ...adminOnly, periodStaffAssignmentController.assignStaffToPeriod);

// Get pending initialization for a period
router.get('/periods/:periodId/assignments/pending', ...adminOnly, periodStaffAssignmentController.getPendingInitialization);

// Get all pending initializations across all active periods
router.get('/assignments/pending-initiation', ...adminOnly, periodStaffAssignmentController.getAllPendingInitializations);

// Assign workflow to a single staff member
router.patch('/assignments/:assignmentId/workflow', ...adminOnly, periodStaffAssignmentController.assignWorkflow);

// Assign template to a single staff member
router.patch('/assignments/:assignmentId/template', ...adminOnly, periodStaffAssignmentController.assignTemplate);

// Bulk assign workflow
router.post('/periods/:periodId/assignments/bulk-workflow', ...adminOnly, periodStaffAssignmentController.bulkAssignWorkflow);

// Bulk assign template
router.post('/periods/:periodId/assignments/bulk-template', ...adminOnly, periodStaffAssignmentController.bulkAssignTemplate);

export default router;
