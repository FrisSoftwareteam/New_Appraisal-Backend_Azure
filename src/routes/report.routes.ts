import express from 'express';
import { getReportStats, getReportPeriods, exportReport as getReportExport } from '../controllers/report.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Get aggregated stats for a specific period
// Accessible by HR Admins and Super Admins
router.get('/stats', authenticate, requirePermission('viewReports'), getReportStats);
// Fallback list of periods derived from appraisals (for reports UI)
router.get('/periods', authenticate, requirePermission('viewReports'), getReportPeriods);
// Export detailed report
router.get('/export', authenticate, requirePermission('viewReports'), getReportExport);

export default router;
