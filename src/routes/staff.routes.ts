import express from 'express';
import multer from 'multer';
import {
  importStaff,
  getAllStaff,
  updateStaff,
  deleteStaff,
  excludeFromCycle,
  getStaffFilters,
  getPendingStaff,
  resolvePendingStaff,
  deletePendingStaff,
  deleteAllStaff,
  getStaffStats
} from '../controllers/staff.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get staff statistics
router.get('/stats', authenticate, getStaffStats);

// Get all staff with optional filters
router.get('/', authenticate, getAllStaff);

// Pending staff routes
router.get('/pending', authenticate, requirePermission('manageUsers'), getPendingStaff);
router.put('/pending/:id', authenticate, requirePermission('manageUsers'), resolvePendingStaff);
router.delete('/pending/:id', authenticate, requirePermission('manageUsers'), deletePendingStaff);

// Bulk actions
router.delete('/all', authenticate, requirePermission('manageUsers'), deleteAllStaff);

// Update staff member
router.patch('/:id', authenticate, requirePermission('manageUsers'), updateStaff);

// Delete staff member
router.delete('/:id', authenticate, requirePermission('manageUsers'), deleteStaff);

// Exclude staff from current appraisal cycle
router.post('/:id/exclude', authenticate, requirePermission('manageUsers'), excludeFromCycle);

// Import staff from Excel
router.post('/import', authenticate, requirePermission('manageUsers'), upload.single('file'), importStaff);

// Get unique filter options
router.get('/filters', authenticate, getStaffFilters);

export default router;
