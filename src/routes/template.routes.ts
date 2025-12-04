import express from 'express';
import { 
  createTemplate, 
  getAllTemplates, 
  getTemplateById, 
  updateTemplate, 
  deleteTemplate,
  assignTemplate,
  approveTemplate,
  getEligibleStaffForTemplate,
  deleteAllTemplates,
  rejectTemplate
} from '../controllers/template.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', authenticate, requirePermission('manageTemplates'), deleteAllTemplates);

// Public routes (authenticated)
router.get('/', authenticate, getAllTemplates);
router.get('/:id', authenticate, getTemplateById);

// Admin only routes
router.post('/', authenticate, requirePermission('manageTemplates'), createTemplate);
router.patch('/:id', authenticate, requirePermission('manageTemplates'), updateTemplate);
router.delete('/:id', authenticate, requirePermission('manageTemplates'), deleteTemplate);
router.post('/:id/assign', authenticate, requirePermission('manageTemplates'), assignTemplate);
router.post('/:id/approve', authenticate, requirePermission('manageTemplates'), approveTemplate);
router.post('/:id/reject', authenticate, requirePermission('manageTemplates'), rejectTemplate);
router.get('/:id/eligible-staff', authenticate, requirePermission('manageTemplates'), getEligibleStaffForTemplate);

export default router;
