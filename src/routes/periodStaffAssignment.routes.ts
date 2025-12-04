import express from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import * as periodStaffAssignmentController from '../controllers/periodStaffAssignment.controller';

const router = express.Router();

// All routes require authentication and systemSettings permission
router.use(authenticate);
router.use(requirePermission('systemSettings'));

// Get all staff assignments for a period
router.get('/periods/:periodId/assignments', periodStaffAssignmentController.getPeriodStaffAssignments);

// Assign staff to a period
router.post('/periods/:periodId/assignments', periodStaffAssignmentController.assignStaffToPeriod);

// Get pending initialization for a period
router.get('/periods/:periodId/assignments/pending', periodStaffAssignmentController.getPendingInitialization);

// Get all pending initializations across all active periods
router.get('/assignments/pending-initiation', periodStaffAssignmentController.getAllPendingInitializations);

// Assign workflow to a single staff member
router.patch('/assignments/:assignmentId/workflow', periodStaffAssignmentController.assignWorkflow);

// Assign template to a single staff member
router.patch('/assignments/:assignmentId/template', periodStaffAssignmentController.assignTemplate);

// Bulk assign workflow
router.post('/periods/:periodId/assignments/bulk-workflow', periodStaffAssignmentController.bulkAssignWorkflow);

// Bulk assign template
router.post('/periods/:periodId/assignments/bulk-template', periodStaffAssignmentController.bulkAssignTemplate);

export default router;
