import express from 'express';
import * as auditController from '../controllers/audit.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Only admins and HR should see audit logs
router.get('/', authenticate, authorize(['super_admin', 'hr_admin']), auditController.getAuditLogs);

export default router;
