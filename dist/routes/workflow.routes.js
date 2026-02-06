"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workflow_controller_1 = require("../controllers/workflow.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Bulk actions - Must be defined BEFORE /:id routes
router.delete('/all', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.deleteAllWorkflows);
// Public routes (authenticated)
router.get('/', auth_middleware_1.authenticate, workflow_controller_1.getAllWorkflows);
router.get('/:id', auth_middleware_1.authenticate, workflow_controller_1.getWorkflowById);
// Admin only routes
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.createWorkflow);
router.patch('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.updateWorkflow);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.deleteWorkflow);
router.post('/:id/duplicate', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.duplicateWorkflow);
router.post('/:id/default', auth_middleware_1.authenticate, (0, auth_middleware_1.requirePermission)('systemSettings'), workflow_controller_1.setDefaultWorkflow);
exports.default = router;
