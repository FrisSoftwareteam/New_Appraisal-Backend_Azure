import express from 'express';
import * as roleController from '../controllers/role.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

// Public for now to allow fetching on load, or authenticated
router.get('/', authenticate, roleController.getRoles);

// Only admins can update roles
router.put('/:id', authenticate, requirePermission('systemSettings'), roleController.updateRole);

export default router;
