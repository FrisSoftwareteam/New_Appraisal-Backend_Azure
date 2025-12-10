"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const appraisal_controller_1 = require("../controllers/appraisal.controller");
const appraisal_assignment_controller_1 = require("../controllers/appraisal-assignment.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Base route: /api/appraisals
// Initiate (Admin/HR only)
router.post('/initiate', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), appraisal_controller_1.initiateAppraisal);
// Get All (Admin/HR only)
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), appraisal_controller_1.getAllAppraisals);
// Get assignments
router.get('/:id/assignments', auth_middleware_1.authenticate, appraisal_assignment_controller_1.getAssignments);
// Update assignments
router.put('/:id/assignments', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)(['super_admin', 'hr_admin']), appraisal_assignment_controller_1.updateAssignments);
// My Appraisals (Employee)
router.get('/my-appraisals', auth_middleware_1.authenticate, appraisal_controller_1.getMyAppraisals);
// Pending Appraisals (Manager)
router.get('/pending', auth_middleware_1.authenticate, appraisal_controller_1.getPendingAppraisals);
// Appraisals assigned to me for review (Peer/Manager/Self)
router.get('/assigned-reviews', auth_middleware_1.authenticate, appraisal_controller_1.getAssignedAppraisals);
// Get by ID
router.get('/:id', auth_middleware_1.authenticate, appraisal_controller_1.getAppraisalById);
// Submit Review (Generic)
router.post('/:id/review', auth_middleware_1.authenticate, appraisal_controller_1.submitReview);
// Reject Appraisal
router.post('/:id/reject', auth_middleware_1.authenticate, appraisal_controller_1.rejectAppraisal);
// Accept Appraisal
router.post('/:id/accept', auth_middleware_1.authenticate, appraisal_controller_1.acceptAppraisal);
exports.default = router;
