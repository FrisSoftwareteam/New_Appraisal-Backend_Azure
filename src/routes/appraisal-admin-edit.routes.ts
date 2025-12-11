import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getAppraisalForUser,
  updateAdminVersion,
  getEditHistory
} from '../controllers/appraisal-admin-edit.controller';

const router = express.Router();

// Get appraisal with role-appropriate version
router.get('/:id/for-user', authenticate, getAppraisalForUser);

// Update admin version (post-completion editing)
router.put('/:id/admin-edit', authenticate, updateAdminVersion);

// Get edit history
router.get('/:id/edit-history', authenticate, getEditHistory);

export default router;
