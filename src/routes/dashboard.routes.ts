import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/stats', authenticate, dashboardController.getDashboardStats);

export default router;
