"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const staff_controller_1 = require("../controllers/staff.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Get all staff with optional filters
router.get('/', auth_middleware_1.authenticate, staff_controller_1.getAllStaff);
// Update staff member
router.patch('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), staff_controller_1.updateStaff);
// Delete staff member
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), staff_controller_1.deleteStaff);
// Exclude staff from current appraisal cycle
router.post('/:id/exclude', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), staff_controller_1.excludeFromCycle);
// Import staff from Excel
router.post('/import', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), upload.single('file'), staff_controller_1.importStaff);
// Get unique filter options
router.get('/filters', auth_middleware_1.authenticate, staff_controller_1.getStaffFilters);
exports.default = router;
