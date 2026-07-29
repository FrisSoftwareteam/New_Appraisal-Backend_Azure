import express from 'express';
import {
  getGrades,
  getGradeById,
  createGrade,
  updateGrade,
  deleteGrade,
  getUnmappedGradeNames,
  getLeaveAllowanceRate,
  updateLeaveAllowanceRate,
} from '../controllers/grade.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/unmapped-grade-names', authenticate, requirePermission('manageSalarySettings'), getUnmappedGradeNames);
router.get('/settings/leave-allowance-rate', authenticate, requirePermission('manageSalarySettings'), getLeaveAllowanceRate);
router.put('/settings/leave-allowance-rate', authenticate, requirePermission('manageSalarySettings'), updateLeaveAllowanceRate);

router.get('/', authenticate, requirePermission('manageSalarySettings'), getGrades);
router.post('/', authenticate, requirePermission('manageSalarySettings'), createGrade);
router.get('/:id', authenticate, requirePermission('manageSalarySettings'), getGradeById);
router.patch('/:id', authenticate, requirePermission('manageSalarySettings'), updateGrade);
router.delete('/:id', authenticate, requirePermission('manageSalarySettings'), deleteGrade);

export default router;
