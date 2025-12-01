import express from 'express';
import { 
  createTemplate, 
  getAllTemplates, 
  getTemplateById, 
  updateTemplate, 
  deleteTemplate,
  assignTemplate,
  approveTemplate,
  getEligibleStaffForTemplate
} from '../controllers/template.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Public routes (authenticated)
router.get('/', authenticate, getAllTemplates);
router.get('/:id', authenticate, getTemplateById);

// Admin only routes
router.post('/', authenticate, authorize(['super_admin', 'hr_admin']), createTemplate);
router.patch('/:id', authenticate, authorize(['super_admin', 'hr_admin']), updateTemplate);
router.delete('/:id', authenticate, authorize(['super_admin', 'hr_admin']), deleteTemplate);
router.post('/:id/assign', authenticate, authorize(['super_admin', 'hr_admin']), assignTemplate);
router.post('/:id/approve', authenticate, authorize(['super_admin', 'hr_admin']), approveTemplate);
router.get('/:id/eligible-staff', authenticate, authorize(['super_admin', 'hr_admin']), getEligibleStaffForTemplate);

export default router;
