import express from 'express';
import multer from 'multer';
import {
  getMyLeaveBalance,
  getUserLeaveBalance,
  listAllLeaveBalances,
  bulkImportLeaveBalances,
  adjustLeaveBalance,
} from '../controllers/leaveBalance.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Static-segment routes must stay above the `/:userId` catch-all - Express matches
// top-to-bottom and `/:userId` would otherwise swallow `/me` and `/bulk-import`.
router.get('/me', authenticate, getMyLeaveBalance);
router.get('/', authenticate, requirePermission('manageSalarySettings'), listAllLeaveBalances);
router.post(
  '/bulk-import',
  authenticate,
  requirePermission('manageSalarySettings'),
  upload.single('file'),
  bulkImportLeaveBalances
);
router.patch('/:userId/adjust', authenticate, requirePermission('manageSalarySettings'), adjustLeaveBalance);
router.get('/:userId', authenticate, requirePermission('manageUsers'), getUserLeaveBalance);

export default router;
