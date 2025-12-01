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
exports.updateAssignments = exports.getAssignments = void 0;
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
// Get assignments for an appraisal
const getAssignments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const appraisal = yield Appraisal_1.default.findById(id)
            .populate('workflow')
            .populate('stepAssignments.assignedUser', 'firstName lastName email role avatar');
        if (!appraisal) {
            return res.status(404).json({ message: 'Appraisal not found' });
        }
        // If stepAssignments is empty (legacy or new), try to resolve them
        if (!appraisal.stepAssignments || appraisal.stepAssignments.length === 0) {
            // This logic might be better placed in a service or shared helper
            // For now, we return what we have, or maybe trigger a resolution
        }
        res.status(200).json(appraisal.stepAssignments);
    }
    catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Error fetching assignments' });
    }
});
exports.getAssignments = getAssignments;
// Update assignments for an appraisal
const updateAssignments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { assignments } = req.body; // Array of { stepId, assignedUserId }
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal) {
            return res.status(404).json({ message: 'Appraisal not found' });
        }
        // Validate permissions (HR or Admin)
        if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) !== 'super_admin' && ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) !== 'hr_admin') {
            return res.status(403).json({ message: 'Not authorized to update assignments' });
        }
        // Update assignments
        // We iterate through the provided assignments and update the matching step in the appraisal
        assignments.forEach((update) => {
            const existingAssignmentIndex = appraisal.stepAssignments.findIndex(sa => sa.stepId === update.stepId);
            if (existingAssignmentIndex >= 0) {
                appraisal.stepAssignments[existingAssignmentIndex].assignedUser = update.assignedUserId;
            }
            else {
                // Should not happen if initialized correctly, but handle anyway
                appraisal.stepAssignments.push({
                    stepId: update.stepId,
                    assignedUser: update.assignedUserId,
                    status: 'pending'
                });
            }
        });
        yield appraisal.save();
        // Return updated assignments with population
        const updatedAppraisal = yield Appraisal_1.default.findById(id)
            .populate('stepAssignments.assignedUser', 'firstName lastName email role avatar');
        res.status(200).json(updatedAppraisal === null || updatedAppraisal === void 0 ? void 0 : updatedAppraisal.stepAssignments);
    }
    catch (error) {
        console.error('Error updating assignments:', error);
        res.status(500).json({ message: 'Error updating assignments' });
    }
});
exports.updateAssignments = updateAssignments;
