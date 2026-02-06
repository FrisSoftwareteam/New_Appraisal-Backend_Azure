"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const template_controller_1 = require("../controllers/template.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.deleteAllTemplates);
// Public routes (authenticated)
router.get('/', auth_middleware_1.authenticate, template_controller_1.getAllTemplates);
router.get('/:id', auth_middleware_1.authenticate, template_controller_1.getTemplateById);
// Admin only routes
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.createTemplate);
router.patch('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.updateTemplate);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.deleteTemplate);
router.post('/:id/assign', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.assignTemplate);
router.post('/:id/approve', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.approveTemplate);
router.post('/:id/reject', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.rejectTemplate);
router.get('/:id/eligible-staff', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('manageTemplates'), template_controller_1.getEligibleStaffForTemplate);
exports.default = router;
