import express from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/login', authController.login);
router.post('/firebase-login', authController.loginWithFirebase);
router.post('/debug-login', authController.debugLogin); // Debug endpoint for development
router.get('/me', authenticate, authController.getMe);

export default router;
