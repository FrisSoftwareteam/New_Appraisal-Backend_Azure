import express from 'express';
import multer from 'multer';
import { 
  importStaff, 
  getAllStaff, 
  updateStaff, 
  deleteStaff, 
  excludeFromCycle,
  getStaffFilters 
} from '../controllers/staff.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all staff with optional filters
router.get('/', authenticate, getAllStaff);

// Update staff member
router.patch('/:id', authenticate, authorize(['super_admin', 'hr_admin']), updateStaff);

// Delete staff member
router.delete('/:id', authenticate, authorize(['super_admin', 'hr_admin']), deleteStaff);

// Exclude staff from current appraisal cycle
router.post('/:id/exclude', authenticate, authorize(['super_admin', 'hr_admin']), excludeFromCycle);

// Import staff from Excel
router.post('/import', authenticate, authorize(['super_admin', 'hr_admin']), upload.single('file'), importStaff);

// Get unique filter options
router.get('/filters', authenticate, getStaffFilters);

export default router;
