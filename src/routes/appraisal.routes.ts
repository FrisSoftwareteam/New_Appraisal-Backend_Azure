import express from 'express';
import { 
  initiateAppraisal, 
  submitReview,
  rejectAppraisal, 
  acceptAppraisal,
  getAppraisalById,
  getMyAppraisals, 
  getPendingAppraisals,
  getAssignedAppraisals,
  getAllAppraisals,
  deleteAllAppraisals
} from '../controllers/appraisal.controller';
import { getAssignments, updateAssignments } from '../controllers/appraisal-assignment.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Base route: /api/appraisals

// Initiate (Admin/HR only)
router.post('/initiate', authenticate, requirePermission('createAppraisals'), initiateAppraisal);

// Delete All (Super Admin only - Cleanup)
router.delete('/delete-all', authenticate, requirePermission('manageSystem'), deleteAllAppraisals);

// Get All (Admin/HR only)
router.get('/', authenticate, requirePermission('viewAppraisals'), getAllAppraisals);

// Get assignments
router.get('/:id/assignments', authenticate, getAssignments);

// Update assignments
router.put('/:id/assignments', authenticate, requirePermission('createAppraisals'), updateAssignments);

// My Appraisals (Employee)
router.get('/my-appraisals', authenticate, getMyAppraisals);

// Pending Appraisals (Manager)
router.get('/pending', authenticate, getPendingAppraisals);

// Appraisals assigned to me for review (Peer/Manager/Self)
router.get('/assigned-reviews', authenticate, getAssignedAppraisals);

// Get by ID
router.get('/:id', authenticate, getAppraisalById);

// Submit Review (Generic)
router.post('/:id/review', authenticate, submitReview);

// Reject Appraisal
router.post('/:id/reject', authenticate, rejectAppraisal);

// Accept Appraisal
router.post('/:id/accept', authenticate, acceptAppraisal);

export default router;
