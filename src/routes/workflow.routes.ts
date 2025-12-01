import express from 'express';
import { 
  createWorkflow, 
  getAllWorkflows, 
  getWorkflowById, 
  updateWorkflow, 
  deleteWorkflow,
  duplicateWorkflow,
  setDefaultWorkflow
} from '../controllers/workflow.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes (authenticated)
router.get('/', authenticate, getAllWorkflows);
router.get('/:id', authenticate, getWorkflowById);

// Admin only routes
router.post('/', authenticate, authorize(['super_admin', 'hr_admin']), createWorkflow);
router.patch('/:id', authenticate, authorize(['super_admin', 'hr_admin']), updateWorkflow);
router.delete('/:id', authenticate, authorize(['super_admin', 'hr_admin']), deleteWorkflow);
router.post('/:id/duplicate', authenticate, authorize(['super_admin', 'hr_admin']), duplicateWorkflow);
router.post('/:id/default', authenticate, authorize(['super_admin', 'hr_admin']), setDefaultWorkflow);

export default router;
