import express from 'express';
import * as periodController from '../controllers/period.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/', authenticate, authorize(['system_admin', 'hr_admin']), periodController.createPeriod);
router.get('/', authenticate, periodController.getPeriods);
router.get('/:id', authenticate, periodController.getPeriodById);
router.patch('/:id', authenticate, authorize(['system_admin', 'hr_admin']), periodController.updatePeriod);
router.delete('/:id', authenticate, authorize(['system_admin', 'hr_admin']), periodController.deletePeriod);

// Staff management routes
router.get('/:id/staff', authenticate, periodController.getAssignedStaff);
router.post('/:id/staff', authenticate, authorize(['system_admin', 'hr_admin']), periodController.assignStaff);
router.delete('/:id/staff/:employeeId', authenticate, authorize(['system_admin', 'hr_admin']), periodController.removeStaff);

export default router;
