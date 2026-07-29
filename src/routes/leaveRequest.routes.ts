import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  createLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
  getMyPendingApprovals,
  actOnLeaveRequest,
  getAllLeaveRequests,
  markLeaveReturned,
  reviewLeaveReturn,
} from '../controllers/leaveRequest.controller';

const router = Router();

router.post('/', authenticate, createLeaveRequest);
router.get('/me', authenticate, getMyLeaveRequests);
router.delete('/:id', authenticate, cancelLeaveRequest);
router.get('/approvals', authenticate, getMyPendingApprovals);
router.put('/:id/action', authenticate, actOnLeaveRequest);
router.put('/:id/mark-returned', authenticate, markLeaveReturned);
router.put('/:id/review-return', authenticate, reviewLeaveReturn);
router.get('/admin/all', authenticate, getAllLeaveRequests);

export default router;
