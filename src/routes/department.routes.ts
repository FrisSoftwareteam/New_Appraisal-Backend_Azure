import express from 'express';
import { getAll, getById, create, update, remove, getUnmapped } from '../controllers/department.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/', authenticate, getAll);
router.get('/unmapped', authenticate, requirePermission('manageUsers'), getUnmapped);
router.post('/', authenticate, requirePermission('manageUsers'), create);
router.get('/:id', authenticate, getById);
router.patch('/:id', authenticate, requirePermission('manageUsers'), update);
router.delete('/:id', authenticate, requirePermission('manageUsers'), remove);

export default router;
