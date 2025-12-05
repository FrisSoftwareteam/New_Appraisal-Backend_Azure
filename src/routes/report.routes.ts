import express from 'express';
import { getReportStats } from '../controllers/report.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Get aggregated stats for a specific period
// Accessible by HR Admins and Super Admins
router.get('/stats', authenticate, requirePermission('viewReports'), getReportStats);

export default router;
