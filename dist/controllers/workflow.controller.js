"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDefaultWorkflow = exports.duplicateWorkflow = exports.deleteAllWorkflows = exports.deleteWorkflow = exports.updateWorkflow = exports.getWorkflowById = exports.getAllWorkflows = exports.createWorkflow = void 0;
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
// Create a new workflow
const createWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, steps, isDefault } = req.body;
        // If this is set as default, unset others
        if (isDefault) {
            yield AppraisalFlow_1.default.updateMany({}, { isDefault: false });
        }
        const workflow = new AppraisalFlow_1.default({
            name,
            description,
            steps,
            isDefault,
            createdBy: req.user.id
        });
        yield workflow.save();
        res.status(201).json(workflow);
    }
    catch (error) {
        console.error('Error creating workflow:', error);
        res.status(500).json({ message: 'Error creating workflow' });
    }
});
exports.createWorkflow = createWorkflow;
// Get all workflows
const getAllWorkflows = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workflows = yield AppraisalFlow_1.default.find().sort({ createdAt: -1 });
        res.status(200).json(workflows);
    }
    catch (error) {
        console.error('Error fetching workflows:', error);
        res.status(500).json({ message: 'Error fetching workflows' });
    }
});
exports.getAllWorkflows = getAllWorkflows;
// Get single workflow
const getWorkflowById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workflow = yield AppraisalFlow_1.default.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        res.status(200).json(workflow);
    }
    catch (error) {
        console.error('Error fetching workflow:', error);
        res.status(500).json({ message: 'Error fetching workflow' });
    }
});
exports.getWorkflowById = getWorkflowById;
// Update workflow
const updateWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, steps, isDefault } = req.body;
        // If setting as default, unset others
        if (isDefault) {
            yield AppraisalFlow_1.default.updateMany({ _id: { $ne: req.params.id } }, { isDefault: false });
        }
        const workflow = yield AppraisalFlow_1.default.findByIdAndUpdate(req.params.id, { name, description, steps, isDefault }, { new: true, runValidators: true });
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        res.status(200).json(workflow);
    }
    catch (error) {
        console.error('Error updating workflow:', error);
        res.status(500).json({ message: 'Error updating workflow' });
    }
});
exports.updateWorkflow = updateWorkflow;
// Delete workflow
const deleteWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const workflow = yield AppraisalFlow_1.default.findByIdAndDelete(req.params.id);
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        res.status(200).json({ message: 'Workflow deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting workflow:', error);
        res.status(500).json({ message: 'Error deleting workflow' });
    }
});
exports.deleteWorkflow = deleteWorkflow;
const deleteAllWorkflows = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield AppraisalFlow_1.default.deleteMany({});
        res.status(200).json({
            message: 'All workflows deleted successfully',
            deletedCount: result.deletedCount
        });
    }
    catch (error) {
        console.error('Error deleting all workflows:', error);
        res.status(500).json({ message: 'Error deleting all workflows' });
    }
});
exports.deleteAllWorkflows = deleteAllWorkflows;
// Duplicate workflow
const duplicateWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const originalWorkflow = yield AppraisalFlow_1.default.findById(req.params.id);
        if (!originalWorkflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        const newWorkflow = new AppraisalFlow_1.default({
            name: `${originalWorkflow.name} (Copy)`,
            description: originalWorkflow.description,
            steps: originalWorkflow.steps,
            isDefault: false, // Copies shouldn't be default automatically
            createdBy: req.user.id
        });
        yield newWorkflow.save();
        res.status(201).json(newWorkflow);
    }
    catch (error) {
        console.error('Error duplicating workflow:', error);
        res.status(500).json({ message: 'Error duplicating workflow' });
    }
});
exports.duplicateWorkflow = duplicateWorkflow;
// Set default workflow
const setDefaultWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield AppraisalFlow_1.default.updateMany({}, { isDefault: false });
        const workflow = yield AppraisalFlow_1.default.findByIdAndUpdate(req.params.id, { isDefault: true }, { new: true });
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }
        res.status(200).json(workflow);
    }
    catch (error) {
        console.error('Error setting default workflow:', error);
        res.status(500).json({ message: 'Error setting default workflow' });
    }
});
exports.setDefaultWorkflow = setDefaultWorkflow;
