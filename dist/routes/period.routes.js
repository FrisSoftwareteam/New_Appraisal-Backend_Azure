"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const period_controller_1 = require("../controllers/period.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.deleteAllPeriods);
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.createPeriod);
router.get('/', auth_middleware_1.authenticate, period_controller_1.getPeriods);
router.get('/:id', auth_middleware_1.authenticate, period_controller_1.getPeriodById);
router.patch('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.updatePeriod);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.deletePeriod);
// Staff management routes
router.get('/:id/staff', auth_middleware_1.authenticate, period_controller_1.getAssignedStaff);
router.post('/:id/staff', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.assignStaff);
router.delete('/:id/staff/:employeeId', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), period_controller_1.removeStaff);
exports.default = router;
