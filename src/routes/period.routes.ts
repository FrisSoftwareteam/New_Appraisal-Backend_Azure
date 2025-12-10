import express from 'express';
import {
  createPeriod,
  getPeriods,
  getPeriodById,
  updatePeriod,
  deletePeriod,
  getAssignedStaff,
  assignStaff,
  removeStaff,
  deleteAllPeriods
} from '../controllers/period.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', authenticate, requirePermission('systemSettings'), deleteAllPeriods);

router.post('/', authenticate, requirePermission('systemSettings'), createPeriod);
router.get('/', authenticate, getPeriods);
router.get('/:id', authenticate, getPeriodById);
router.patch('/:id', authenticate, requirePermission('systemSettings'), updatePeriod);
router.delete('/:id', authenticate, requirePermission('systemSettings'), deletePeriod);

// Staff management routes
router.get('/:id/staff', authenticate, getAssignedStaff);
router.post('/:id/staff', authenticate, requirePermission('systemSettings'), assignStaff);
router.delete('/:id/staff/:employeeId', authenticate, requirePermission('systemSettings'), removeStaff);

export default router;
