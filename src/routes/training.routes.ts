import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  createTrainingAssignment,
  deleteTrainingAssignment,
  getTrainingAssignments,
  getTrainingRecommendationsForAdmin,
  updateTrainingAssignment,
  updateTrainingAssignmentStatus
} from '../controllers/training.controller';

const router = express.Router();

router.get('/recommendations', authenticate, getTrainingRecommendationsForAdmin);
router.get('/assignments', authenticate, getTrainingAssignments);
router.post('/assignments', authenticate, createTrainingAssignment);
router.put('/assignments/:id', authenticate, updateTrainingAssignment);
router.patch('/assignments/:id/status', authenticate, updateTrainingAssignmentStatus);
router.delete('/assignments/:id', authenticate, deleteTrainingAssignment);

export default router;
