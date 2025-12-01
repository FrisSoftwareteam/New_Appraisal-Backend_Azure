import express from 'express';
import * as flowController from '../controllers/flow.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/', authenticate, authorize(['system_admin', 'hr_admin']), flowController.createFlow);
router.get('/', authenticate, flowController.getFlows);
router.get('/:id', authenticate, flowController.getFlowById);
router.patch('/:id', authenticate, authorize(['system_admin', 'hr_admin']), flowController.updateFlow);
router.delete('/:id', authenticate, authorize(['system_admin', 'hr_admin']), flowController.deleteFlow);

export default router;
