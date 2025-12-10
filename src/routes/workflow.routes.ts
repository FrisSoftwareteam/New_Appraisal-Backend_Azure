import express from 'express';
import { 
  createWorkflow, 
  getAllWorkflows, 
  getWorkflowById, 
  updateWorkflow, 
  deleteWorkflow,
  duplicateWorkflow,
  setDefaultWorkflow,
  deleteAllWorkflows
} from '../controllers/workflow.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', authenticate, requirePermission('systemSettings'), deleteAllWorkflows);

// Public routes (authenticated)
router.get('/', authenticate, getAllWorkflows);
router.get('/:id', authenticate, getWorkflowById);

// Admin only routes
router.post('/', authenticate, requirePermission('systemSettings'), createWorkflow);
router.patch('/:id', authenticate, requirePermission('systemSettings'), updateWorkflow);
router.delete('/:id', authenticate, requirePermission('systemSettings'), deleteWorkflow);
router.post('/:id/duplicate', authenticate, requirePermission('systemSettings'), duplicateWorkflow);
router.post('/:id/default', authenticate, requirePermission('systemSettings'), setDefaultWorkflow);

export default router;
