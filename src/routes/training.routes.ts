import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  approveTrainingAssignment,
  createTrainingAssignment,
  createTrainingAssignmentComment,
  deleteTrainingAssignment,
  getStaffTrainingSignals,
  getTrainingAssignmentById,
  getTrainingAssignmentComments,
  getTrainingAssignments,
  getTrainingRecommendationsForAdmin,
  rejectTrainingAssignment,
  submitTrainingAssignment,
  updateTrainingAssignment,
  updateTrainingAssignmentStatus
} from '../controllers/training.controller';
import {
  createTrainingTest,
  deleteTrainingTest,
  getTrainingTestAttempts,
  getTrainingTestById,
  getTrainingTests,
  resetTrainingTestAttempts,
  startTrainingTestAttempt,
  submitTrainingTestAttempt,
  updateTrainingTest
} from '../controllers/training-test.controller';

const router = express.Router();

// Recommendations. The literal path is registered first so it is not swallowed
// by the :userId param route.
router.get('/recommendations', authenticate, getTrainingRecommendationsForAdmin);
router.get('/recommendations/:userId', authenticate, getStaffTrainingSignals);

// Test library (HR only, enforced in the controller).
router.get('/tests', authenticate, getTrainingTests);
router.post('/tests', authenticate, createTrainingTest);
router.get('/tests/:id', authenticate, getTrainingTestById);
router.put('/tests/:id', authenticate, updateTrainingTest);
router.delete('/tests/:id', authenticate, deleteTrainingTest);

// Assignments.
router.get('/assignments', authenticate, getTrainingAssignments);
router.post('/assignments', authenticate, createTrainingAssignment);
router.get('/assignments/:id', authenticate, getTrainingAssignmentById);
router.put('/assignments/:id', authenticate, updateTrainingAssignment);
router.patch('/assignments/:id/status', authenticate, updateTrainingAssignmentStatus);
router.delete('/assignments/:id', authenticate, deleteTrainingAssignment);

// Review lifecycle: submit -> approve / request changes, with a comment thread.
router.post('/assignments/:id/submit', authenticate, submitTrainingAssignment);
router.post('/assignments/:id/approve', authenticate, approveTrainingAssignment);
router.post('/assignments/:id/reject', authenticate, rejectTrainingAssignment);
router.get('/assignments/:id/comments', authenticate, getTrainingAssignmentComments);
router.post('/assignments/:id/comments', authenticate, createTrainingAssignmentComment);

// Assessment.
router.post('/assignments/:id/test/start', authenticate, startTrainingTestAttempt);
router.post('/assignments/:id/test/submit', authenticate, submitTrainingTestAttempt);
router.get('/assignments/:id/test/attempts', authenticate, getTrainingTestAttempts);
router.post('/assignments/:id/test/reset', authenticate, resetTrainingTestAttempts);

export default router;
