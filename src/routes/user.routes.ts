import express from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Only admins can manage users
router.post('/', authenticate, authorize(['system_admin', 'hr_admin']), userController.createUser);
router.get('/', authenticate, userController.getUsers); // Maybe restrict listing too?
router.get('/:id', authenticate, userController.getUserById);
router.patch('/:id', authenticate, authorize(['system_admin', 'hr_admin']), userController.updateUser);
router.delete('/:id', authenticate, authorize(['system_admin', 'hr_admin']), userController.deleteUser);

export default router;
