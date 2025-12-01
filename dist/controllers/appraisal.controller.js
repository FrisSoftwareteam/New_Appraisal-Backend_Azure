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
exports.getAssignedAppraisals = exports.getAllAppraisals = exports.getPendingAppraisals = exports.getMyAppraisals = exports.getAppraisalById = exports.acceptAppraisal = exports.rejectAppraisal = exports.submitReview = exports.initiateAppraisal = void 0;
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
const User_1 = __importDefault(require("../models/User"));
// Initiate an appraisal for an employee
const initiateAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { employeeId, templateId, workflowId, period, assignments } = req.body;
        // Verify existence
        const employee = yield User_1.default.findById(employeeId);
        const template = yield AppraisalTemplate_1.default.findById(templateId);
        const appraisalFlow = yield AppraisalFlow_1.default.findById(workflowId);
        if (!employee || !template || !appraisalFlow) {
            return res.status(404).json({ message: 'Employee, Template, or Workflow not found' });
        }
        // Check if appraisal already exists for this period
        const existingAppraisal = yield Appraisal_1.default.findOne({
            employee: employeeId,
            period,
            status: { $ne: 'completed' }
        });
        if (existingAppraisal) {
            return res.status(400).json({ message: 'Active appraisal already exists for this period' });
        }
        // Resolve step assignments
        const stepAssignments = appraisalFlow.steps.map((step) => {
            const stepId = step._id || step.id;
            // Check if there's a manual assignment from the wizard
            const manualAssignment = assignments === null || assignments === void 0 ? void 0 : assignments.find((a) => a.stepId === stepId.toString());
            let assignedUser = null;
            if (manualAssignment && manualAssignment.assignedUserId !== 'auto') {
                // Use manual assignment from wizard
                assignedUser = manualAssignment.assignedUserId;
            }
            else {
                // Auto-assign based on role
                if (step.assignedRole === 'employee') {
                    assignedUser = employee._id;
                }
                else if (step.assignedRole === 'supervisor') {
                    assignedUser = employee.supervisor;
                }
            }
            return {
                stepId: stepId.toString(),
                assignedUser: assignedUser,
                status: 'pending'
            };
        });
        const appraisal = new Appraisal_1.default({
            employee: employeeId,
            template: templateId,
            workflow: workflowId,
            period,
            status: 'in_progress',
            currentStep: 0,
            stepAssignments,
            reviews: [],
            history: [{
                    action: 'initiated',
                    actor: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                    comment: 'Appraisal cycle initiated'
                }]
        });
        yield appraisal.save();
        res.status(201).json(appraisal);
    }
    catch (error) {
        console.error('Error initiating appraisal:', error);
        res.status(500).json({ message: 'Error initiating appraisal', error });
    }
});
exports.initiateAppraisal = initiateAppraisal;
// Submit Review (Generic for any step)
const submitReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    try {
        const { id } = req.params;
        const { stepId, responses, overallScore, comments } = req.body;
        const appraisal = yield Appraisal_1.default.findById(id).populate('workflow');
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        // Find the step in the workflow to verify rank/order
        const workflow = appraisal.workflow;
        const currentStepConfig = workflow.steps.find((s) => (s._id || s.id).toString() === stepId);
        if (!currentStepConfig) {
            return res.status(400).json({ message: 'Invalid step ID' });
        }
        // Verify it's the current step (optional, but good for enforcement)
        // For now, we allow submitting if it's the assigned user
        // Check assignment
        const assignment = appraisal.stepAssignments.find(sa => sa.stepId === stepId);
        if (!assignment) {
            return res.status(400).json({ message: 'Step assignment not found' });
        }
        // Verify user is the assigned user (or admin)
        if (((_a = assignment.assignedUser) === null || _a === void 0 ? void 0 : _a.toString()) !== ((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString()) && ((_d = req.user) === null || _d === void 0 ? void 0 : _d.role) !== 'super_admin') {
            return res.status(403).json({ message: 'You are not assigned to this step' });
        }
        // Update or add review
        const reviewIndex = appraisal.reviews.findIndex(r => r.stepId === stepId);
        const reviewData = {
            stepId,
            reviewerId: (_e = req.user) === null || _e === void 0 ? void 0 : _e._id,
            reviewerRole: (_f = req.user) === null || _f === void 0 ? void 0 : _f.role,
            responses,
            overallScore,
            comments,
            submittedAt: new Date(),
            status: 'completed'
        };
        if (reviewIndex >= 0) {
            appraisal.reviews[reviewIndex] = reviewData;
        }
        else {
            appraisal.reviews.push(reviewData);
        }
        // Update assignment status
        assignment.status = 'completed';
        // Check if we should move to next step
        // If this was the current step, increment
        // Logic: Find rank of current step, find next rank
        const currentRank = currentStepConfig.rank;
        const nextStep = workflow.steps.find((s) => s.rank > currentRank); // Simplified: assumes sorted ranks
        // Special Logic: If Step 1 (index 0) was completed by someone OTHER than the employee,
        // and the next step is NOT the employee, we must pause for Employee Acceptance.
        const isFirstStep = appraisal.currentStep === 0;
        const isReviewerEmployee = ((_h = (_g = req.user) === null || _g === void 0 ? void 0 : _g._id) === null || _h === void 0 ? void 0 : _h.toString()) === appraisal.employee.toString();
        // Check if next step is assigned to employee
        let nextStepIsEmployee = false;
        if (nextStep) {
            // We need to check the assignment for the next step to be sure
            const nextStepId = nextStep._id || nextStep.id;
            const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
            if (nextAssignment && ((_j = nextAssignment.assignedUser) === null || _j === void 0 ? void 0 : _j.toString()) === appraisal.employee.toString()) {
                nextStepIsEmployee = true;
            }
        }
        if (isFirstStep && !isReviewerEmployee && !nextStepIsEmployee) {
            // Pause for Employee Acceptance
            appraisal.status = 'pending_employee_review';
            appraisal.history.push({
                action: 'pending_acceptance',
                actor: (_k = req.user) === null || _k === void 0 ? void 0 : _k._id,
                timestamp: new Date(),
                comment: 'Appraisal paused for Employee Acceptance'
            });
        }
        else if (nextStep) {
            appraisal.currentStep = appraisal.currentStep + 1; // Or set based on index
            appraisal.status = 'in_progress';
            // Update next step status to in_progress? Optional, but good for UI
            const nextStepId = nextStep._id || nextStep.id;
            const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
            if (nextAssignment) {
                nextAssignment.status = 'in_progress';
            }
        }
        else {
            appraisal.status = 'completed';
        }
        appraisal.history.push({
            action: 'review_submitted',
            actor: (_l = req.user) === null || _l === void 0 ? void 0 : _l._id,
            timestamp: new Date(),
            comment: `Review submitted for step: ${currentStepConfig.name}`
        });
        // Clear any previous rejection reason
        appraisal.rejectionReason = undefined;
        yield appraisal.save();
        res.json(appraisal);
    }
    catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ message: 'Error submitting review', error });
    }
});
exports.submitReview = submitReview;
// Reject Appraisal (Request Changes)
const rejectAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const appraisal = yield Appraisal_1.default.findById(id).populate('workflow');
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        if (appraisal.status === 'pending_employee_review') {
            // Employee rejected the manager's review
            // Move back to the previous step (which is currentStep, since we didn't increment)
            // We need to reset the status of the current step assignment to 'in_progress' or 'pending'
            // so the manager can edit it.
            appraisal.status = 'in_progress';
            const workflow = appraisal.workflow;
            const currentStepConfig = workflow.steps[appraisal.currentStep];
            const currentStepId = currentStepConfig._id || currentStepConfig.id;
            const assignment = appraisal.stepAssignments.find(sa => sa.stepId === currentStepId.toString());
            if (assignment) {
                assignment.status = 'in_progress'; // Re-open for manager
            }
            // Also maybe clear the review? Or keep it as history?
            // For now, we keep it, but the manager will overwrite it on next submit.
            appraisal.history.push({
                action: 'rejected_by_employee',
                actor: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                timestamp: new Date(),
                comment: `Employee rejected review: ${reason}`
            });
            appraisal.rejectionReason = reason;
        }
        else {
            // Standard rejection (e.g. Manager rejects Employee self-appraisal, or HR rejects Manager)
            // Logic to move back a step
            if (appraisal.currentStep > 0) {
                appraisal.currentStep = appraisal.currentStep - 1;
                // Reset previous step assignment
                const workflow = appraisal.workflow;
                const prevStepConfig = workflow.steps[appraisal.currentStep];
                const prevStepId = prevStepConfig._id || prevStepConfig.id;
                const assignment = appraisal.stepAssignments.find(sa => sa.stepId === prevStepId.toString());
                if (assignment) {
                    assignment.status = 'in_progress';
                }
            }
            appraisal.history.push({
                action: 'rejected',
                actor: (_b = req.user) === null || _b === void 0 ? void 0 : _b._id,
                timestamp: new Date(),
                comment: `Appraisal returned: ${reason}`
            });
        }
        yield appraisal.save();
        res.json(appraisal);
    }
    catch (error) {
        res.status(500).json({ message: 'Error rejecting appraisal', error });
    }
});
exports.rejectAppraisal = rejectAppraisal;
// Accept Appraisal (Final Sign-off or Intermediate Acceptance)
const acceptAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const { id } = req.params;
        const appraisal = yield Appraisal_1.default.findById(id).populate('workflow');
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        // Verify user is the employee
        if (((_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString()) !== appraisal.employee.toString() && ((_c = req.user) === null || _c === void 0 ? void 0 : _c.role) !== 'super_admin') {
            return res.status(403).json({ message: 'Only the employee can accept the appraisal' });
        }
        if (appraisal.status === 'pending_employee_review') {
            // Intermediate acceptance: Move to next step
            appraisal.status = 'in_progress';
            appraisal.currentStep = appraisal.currentStep + 1;
            // Update next step status
            const workflow = appraisal.workflow;
            // We assume currentStep was NOT incremented when it went to pending_employee_review
            // So now we increment it.
            // We need to find the next step to set its status
            if (workflow && workflow.steps[appraisal.currentStep]) {
                const nextStep = workflow.steps[appraisal.currentStep];
                const nextStepId = nextStep._id || nextStep.id;
                const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
                if (nextAssignment) {
                    nextAssignment.status = 'in_progress';
                }
            }
            appraisal.history.push({
                action: 'accepted_intermediate',
                actor: (_d = req.user) === null || _d === void 0 ? void 0 : _d._id,
                timestamp: new Date(),
                comment: 'Employee accepted the appraisal review'
            });
        }
        else {
            // Final acceptance
            appraisal.status = 'completed';
            appraisal.history.push({
                action: 'accepted_final',
                actor: (_e = req.user) === null || _e === void 0 ? void 0 : _e._id,
                timestamp: new Date(),
                comment: 'Appraisal accepted/finalized'
            });
        }
        yield appraisal.save();
        res.json(appraisal);
    }
    catch (error) {
        res.status(500).json({ message: 'Error accepting appraisal', error });
    }
});
exports.acceptAppraisal = acceptAppraisal;
// Get Appraisal by ID
const getAppraisalById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const appraisal = yield Appraisal_1.default.findById(req.params.id)
            .populate('employee', 'firstName lastName email department')
            .populate('template')
            .populate('workflow')
            .populate('history.actor', 'firstName lastName');
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        res.json(appraisal);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching appraisal', error });
    }
});
exports.getAppraisalById = getAppraisalById;
// Get Appraisals for User (My Appraisals)
const getMyAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const appraisals = yield Appraisal_1.default.find({ employee: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id })
            .populate('template', 'name')
            .sort({ createdAt: -1 });
        res.json(appraisals);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching appraisals', error });
    }
});
exports.getMyAppraisals = getMyAppraisals;
// Get Pending Appraisals (For Managers/Appraisers)
// This logic needs to be robust to find appraisals where the current user is the "manager"
// For now, we'll assume the user is a supervisor and find employees they supervise
// OR we can look at the workflow.
const getPendingAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Find users who report to this user
        const directReports = yield User_1.default.find({ supervisor: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id });
        const reportIds = directReports.map(u => u._id);
        const appraisals = yield Appraisal_1.default.find({
            employee: { $in: reportIds },
            status: 'manager_appraisal'
        })
            .populate('employee', 'firstName lastName')
            .populate('template', 'name');
        res.json(appraisals);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching pending appraisals', error });
    }
});
exports.getPendingAppraisals = getPendingAppraisals;
// Get All Appraisals (Admin/HR)
const getAllAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const appraisals = yield Appraisal_1.default.find()
            .populate('employee', 'firstName lastName email department')
            .populate('template', 'name')
            .populate('workflow')
            .sort({ createdAt: -1 });
        res.json(appraisals);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching all appraisals', error });
    }
});
exports.getAllAppraisals = getAllAppraisals;
// Get Appraisals assigned to the current user for review (Active Step)
const getAssignedAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        // Find appraisals where the user is assigned to a step that is pending or in_progress
        const appraisals = yield Appraisal_1.default.find({
            'stepAssignments': {
                $elemMatch: {
                    assignedUser: userId,
                    status: { $in: ['pending', 'in_progress'] }
                }
            },
            status: { $ne: 'completed' }
        })
            .populate('employee', 'firstName lastName email department')
            .populate('template')
            .populate('workflow');
        // Filter to only include appraisals where the *current* step is assigned to this user
        const activeAppraisals = appraisals.filter(appraisal => {
            var _a;
            if (!appraisal.workflow)
                return false;
            const workflow = appraisal.workflow;
            // Ensure currentStep is within bounds
            if (appraisal.currentStep >= workflow.steps.length)
                return false;
            const currentStepId = workflow.steps[appraisal.currentStep]._id || workflow.steps[appraisal.currentStep].id;
            // Find the assignment for this step
            const assignment = appraisal.stepAssignments.find(sa => sa.stepId === currentStepId.toString());
            return assignment && ((_a = assignment.assignedUser) === null || _a === void 0 ? void 0 : _a.toString()) === (userId === null || userId === void 0 ? void 0 : userId.toString());
        });
        res.json(activeAppraisals);
    }
    catch (error) {
        console.error('Error fetching assigned appraisals:', error);
        res.status(500).json({ message: 'Error fetching assigned appraisals', error });
    }
});
exports.getAssignedAppraisals = getAssignedAppraisals;
