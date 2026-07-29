import express from 'express';
import {
  createMyAchievement,
  getMyAchievements,
  deleteMyAchievement,
  getAchievementsForAdmin,
  reviewAchievementForAdmin,
} from '../controllers/achievement.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/me', authenticate, createMyAchievement);
router.get('/me', authenticate, getMyAchievements);
router.delete('/me/:id', authenticate, deleteMyAchievement);
router.get('/admin', authenticate, getAchievementsForAdmin);
router.put('/admin/:id/review', authenticate, reviewAchievementForAdmin);

export default router;
