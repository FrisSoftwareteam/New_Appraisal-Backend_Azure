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
exports.adminEditAppraisal = exports.saveCommendation = exports.saveCommitteeReview = exports.unlockQuestion = exports.lockQuestion = exports.deleteAllAppraisals = exports.deleteAppraisal = exports.getAssignedAppraisals = exports.getAllAppraisals = exports.getPendingAppraisals = exports.getMyAppraisals = exports.getAppraisalById = exports.acceptAppraisal = exports.rejectAppraisal = exports.submitReview = exports.initiateAppraisal = void 0;
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalTemplate_1 = __importDefault(require("../models/AppraisalTemplate"));
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const User_1 = __importDefault(require("../models/User"));
const PeriodStaffAssignment_1 = __importDefault(require("../models/PeriodStaffAssignment"));
const audit_controller_1 = require("./audit.controller");
// Initiate an appraisal for an employee
const initiateAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
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
        // Update PeriodStaffAssignment to mark as initialized
        const periodDoc = yield AppraisalPeriod_1.default.findOne({ name: period });
        if (periodDoc) {
            yield PeriodStaffAssignment_1.default.updateOne({
                employee: employeeId,
                period: periodDoc._id
            }, {
                isInitialized: true,
                workflow: workflowId,
                template: templateId
            });
        }
        // Audit Log
        yield (0, audit_controller_1.createAuditLog)((_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString(), 'create', 'appraisal', appraisal._id.toString(), `Initiated appraisal for ${employee.firstName} ${employee.lastName} - ${period}`, undefined, { templateId, workflowId, period });
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    try {
        const { id } = req.params;
        const { stepId, responses, overallScore, comments } = req.body;
        const appraisal = yield Appraisal_1.default.findById(id).populate('workflow');
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        // Check if appraisal is completed and user is admin/committee
        if (appraisal.status === 'completed') {
            const isAdminOrCommittee = ['hr_admin', 'appraisal_committee', 'super_admin'].includes(((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || '');
            if (isAdminOrCommittee) {
                return res.status(400).json({
                    message: 'This appraisal is completed. Please use the admin edit endpoint to modify it.',
                    hint: `PUT /api/appraisals/${id}/admin-edit`,
                    useAdminEdit: true
                });
            }
            else {
                return res.status(400).json({
                    message: 'This appraisal is already completed and cannot be modified.'
                });
            }
        }
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
        if (((_b = assignment.assignedUser) === null || _b === void 0 ? void 0 : _b.toString()) !== ((_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id) === null || _d === void 0 ? void 0 : _d.toString()) && ((_e = req.user) === null || _e === void 0 ? void 0 : _e.role) !== 'super_admin') {
            return res.status(403).json({ message: 'You are not assigned to this step' });
        }
        // Update or add review
        const reviewIndex = appraisal.reviews.findIndex(r => r.stepId === stepId);
        const reviewData = {
            stepId,
            reviewerId: (_f = req.user) === null || _f === void 0 ? void 0 : _f._id,
            reviewerRole: (_g = req.user) === null || _g === void 0 ? void 0 : _g.role,
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
        const isReviewerEmployee = ((_j = (_h = req.user) === null || _h === void 0 ? void 0 : _h._id) === null || _j === void 0 ? void 0 : _j.toString()) === appraisal.employee.toString();
        // If the reviewer was NOT the employee, we must pause for Employee Acceptance
        // This applies to EVERY step done by someone else (Manager, HR, etc.)
        if (!isReviewerEmployee) {
            // Pause for Employee Acceptance
            appraisal.status = 'pending_employee_review';
            appraisal.history.push({
                action: 'pending_acceptance',
                actor: (_k = req.user) === null || _k === void 0 ? void 0 : _k._id,
                timestamp: new Date(),
                comment: 'Appraisal paused for Employee Acceptance'
            });
            // We do NOT increment currentStep here. 
            // It will be incremented when the employee accepts.
        }
        else {
            // Employee submitted their own step, proceed to next
            if (nextStep) {
                appraisal.currentStep = appraisal.currentStep + 1;
                appraisal.status = 'in_progress';
                // Update next step status to in_progress
                const nextStepId = nextStep._id || nextStep.id;
                const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
                if (nextAssignment) {
                    nextAssignment.status = 'in_progress';
                }
            }
            // If no next step, keep status as 'in_progress' - waiting for next reviewer
            // Appraisal should only complete via acceptAppraisal after employee accepts final step
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
        // Audit Log
        yield (0, audit_controller_1.createAuditLog)((_o = (_m = req.user) === null || _m === void 0 ? void 0 : _m._id) === null || _o === void 0 ? void 0 : _o.toString(), 'submit_review', 'appraisal', appraisal._id.toString(), `Review submitted for step: ${currentStepConfig.name} by ${(_p = req.user) === null || _p === void 0 ? void 0 : _p.role}`, undefined, { stepId, overallScore });
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
    var _a, _b, _c, _d, _e;
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
        // Audit Log
        yield (0, audit_controller_1.createAuditLog)((_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id) === null || _d === void 0 ? void 0 : _d.toString(), 'appraisal_rejected', 'appraisal', appraisal._id.toString(), `Appraisal rejected/returned by ${(_e = req.user) === null || _e === void 0 ? void 0 : _e.role}: ${reason}`);
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
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
            const workflow = appraisal.workflow;
            const nextStepIndex = appraisal.currentStep + 1;
            // Check if this was the final step
            if (nextStepIndex >= workflow.steps.length) {
                // Workflow Complete
                appraisal.status = 'completed';
                appraisal.currentStep = nextStepIndex;
                appraisal.history.push({
                    action: 'accepted_final',
                    actor: (_d = req.user) === null || _d === void 0 ? void 0 : _d._id,
                    timestamp: new Date(),
                    comment: 'Appraisal review accepted and process finalized'
                });
                // Audit Log
                yield (0, audit_controller_1.createAuditLog)((_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e._id) === null || _f === void 0 ? void 0 : _f.toString(), 'appraisal_completed', 'appraisal', appraisal._id.toString(), 'Appraisal finalized and accepted by employee');
            }
            else {
                // Intermediate acceptance: Move to next step
                appraisal.status = 'in_progress';
                appraisal.currentStep = nextStepIndex;
                // Update next step status
                if (workflow && workflow.steps[nextStepIndex]) {
                    const nextStep = workflow.steps[nextStepIndex];
                    const nextStepId = nextStep._id || nextStep.id;
                    const nextAssignment = appraisal.stepAssignments.find(sa => sa.stepId === nextStepId.toString());
                    if (nextAssignment) {
                        nextAssignment.status = 'in_progress';
                    }
                }
                appraisal.history.push({
                    action: 'accepted_intermediate',
                    actor: (_g = req.user) === null || _g === void 0 ? void 0 : _g._id,
                    timestamp: new Date(),
                    comment: 'Employee accepted the appraisal review'
                });
                // Audit Log
                yield (0, audit_controller_1.createAuditLog)((_j = (_h = req.user) === null || _h === void 0 ? void 0 : _h._id) === null || _j === void 0 ? void 0 : _j.toString(), 'appraisal_accepted_intermediate', 'appraisal', appraisal._id.toString(), 'Employee accepted intermediate review', undefined, { currentStep: appraisal.currentStep });
            }
        }
        else {
            // Final acceptance (Direct, if not via pending_employee_review)
            appraisal.status = 'completed';
            appraisal.history.push({
                action: 'accepted_final',
                actor: (_k = req.user) === null || _k === void 0 ? void 0 : _k._id,
                timestamp: new Date(),
                comment: 'Appraisal accepted/finalized'
            });
            // Audit Log
            yield (0, audit_controller_1.createAuditLog)((_m = (_l = req.user) === null || _l === void 0 ? void 0 : _l._id) === null || _m === void 0 ? void 0 : _m.toString(), 'appraisal_completed', 'appraisal', appraisal._id.toString(), 'Appraisal finalized and accepted by employee');
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
            .populate('employee', 'firstName lastName email department division grade role')
            .populate('template')
            .populate('workflow')
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
// Delete Single Appraisal (Admin - returns employee to pending initiation)
const deleteAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Find the appraisal first to get employee and period info
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal) {
            return res.status(404).json({ message: 'Appraisal not found' });
        }
        const employeeId = appraisal.employee;
        const periodName = appraisal.period;
        // Delete the appraisal
        yield Appraisal_1.default.findByIdAndDelete(id);
        // Find the period to get its ID
        const period = yield AppraisalPeriod_1.default.findOne({ name: periodName });
        if (period) {
            // Reset the PeriodStaffAssignment to return employee to pending initiation
            yield PeriodStaffAssignment_1.default.updateOne({
                employee: employeeId,
                period: period._id
            }, {
                isInitialized: false
                // Keep workflow and template for history
            });
        }
        // Audit Log
        if (req.user) {
            yield (0, audit_controller_1.createAuditLog)(req.user._id.toString(), 'delete', 'appraisal', id, `Deleted appraisal for employee ${employeeId} in period ${periodName}`, undefined, { employeeId, period: periodName });
        }
        res.status(200).json({
            message: 'Appraisal deleted successfully. Employee returned to pending initiation.',
            employeeId,
            period: periodName
        });
    }
    catch (error) {
        console.error('Error deleting appraisal:', error);
        res.status(500).json({ message: 'Error deleting appraisal', error });
    }
});
exports.deleteAppraisal = deleteAppraisal;
// Delete All Appraisals (Admin Cleanup)
const deleteAllAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield Appraisal_1.default.deleteMany({});
        res.status(200).json({
            message: 'All appraisals deleted successfully',
            deletedCount: result.deletedCount
        });
        // Audit Log
        if (result.deletedCount > 0) {
            // Since this is an admin action and user might not be in req.user if called internally (but it is an endpoint),
            // we check req.user.
            if (req.user) {
                yield (0, audit_controller_1.createAuditLog)(req.user._id.toString(), 'delete', 'appraisal', 'ALL', `Deleted all appraisals (${result.deletedCount} records)`, undefined, { deletedCount: result.deletedCount });
            }
        }
    }
    catch (error) {
        console.error('Error deleting all appraisals:', error);
        res.status(500).json({ message: 'Error deleting all appraisals' });
    }
});
exports.deleteAllAppraisals = deleteAllAppraisals;
// Lock a question for editing
const lockQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { questionId } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        // Check if already locked by someone else
        const existingLock = (_b = appraisal.lockedQuestions) === null || _b === void 0 ? void 0 : _b.find(l => l.questionId === questionId);
        if (existingLock) {
            // Check if lock is expired (e.g., 5 minutes)
            const lockTime = new Date(existingLock.lockedAt).getTime();
            const now = new Date().getTime();
            const isExpired = (now - lockTime) > 5 * 60 * 1000;
            if (!isExpired && existingLock.lockedBy.toString() !== (userId === null || userId === void 0 ? void 0 : userId.toString())) {
                return res.status(409).json({
                    message: 'Question is locked by another user',
                    lockedBy: existingLock.lockedBy
                });
            }
            // If expired or owned by user, we update/refresh it below
        }
        // Remove existing lock for this question if any
        if (appraisal.lockedQuestions) {
            appraisal.lockedQuestions = appraisal.lockedQuestions.filter(l => l.questionId !== questionId);
        }
        else {
            appraisal.lockedQuestions = [];
        }
        // Add new lock
        appraisal.lockedQuestions.push({
            questionId,
            lockedBy: userId,
            lockedAt: new Date()
        });
        yield appraisal.save();
        res.json({ message: 'Question locked successfully', lockedAt: new Date() });
    }
    catch (error) {
        res.status(500).json({ message: 'Error locking question', error });
    }
});
exports.lockQuestion = lockQuestion;
// Unlock a question
const unlockQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { questionId } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        if (appraisal.lockedQuestions) {
            // Only allow unlocking if user owns the lock or is admin
            const lock = appraisal.lockedQuestions.find(l => l.questionId === questionId);
            if (lock && lock.lockedBy.toString() === (userId === null || userId === void 0 ? void 0 : userId.toString())) {
                appraisal.lockedQuestions = appraisal.lockedQuestions.filter(l => l.questionId !== questionId);
                yield appraisal.save();
            }
        }
        res.json({ message: 'Question unlocked successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error unlocking question', error });
    }
});
exports.unlockQuestion = unlockQuestion;
// Save Committee Review (Shared Marks)
const saveCommitteeReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const { id } = req.params;
        const { stepId, responses } = req.body; // responses: [{ questionId, response, score, comment }]
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        const review = appraisal.reviews.find(r => r.stepId === stepId);
        if (!review)
            return res.status(404).json({ message: 'Review step not found' });
        if (!review.isCommittee) {
            // Initialize committee fields if not present (migration/fallback)
            review.isCommittee = true;
            review.committeeMembers = review.committeeMembers || [];
            review.changeLog = review.changeLog || [];
        }
        // Add user to committee members if not present
        if (!((_b = review.committeeMembers) === null || _b === void 0 ? void 0 : _b.some(m => m.toString() === (userId === null || userId === void 0 ? void 0 : userId.toString())))) {
            (_c = review.committeeMembers) === null || _c === void 0 ? void 0 : _c.push(userId);
        }
        // Process updates and log changes
        responses.forEach((update) => {
            var _a;
            const existingResponseIndex = review.responses.findIndex(r => r.questionId === update.questionId);
            let oldValue = null;
            if (existingResponseIndex >= 0) {
                oldValue = review.responses[existingResponseIndex].score; // Tracking score changes primarily
                review.responses[existingResponseIndex] = Object.assign(Object.assign({}, review.responses[existingResponseIndex]), update);
            }
            else {
                review.responses.push(update);
            }
            // Log change if score changed
            if (update.score !== undefined && update.score !== oldValue) {
                (_a = review.changeLog) === null || _a === void 0 ? void 0 : _a.push({
                    questionId: update.questionId,
                    oldValue,
                    newValue: update.score,
                    changedBy: userId,
                    timestamp: new Date()
                });
            }
        });
        // Update timestamp
        review.submittedAt = new Date(); // Update last modified time
        review.status = 'in_progress';
        yield appraisal.save();
        // Audit Log
        yield (0, audit_controller_1.createAuditLog)((_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString(), 'committee_review', 'appraisal', appraisal._id.toString(), `Committee review updated by ${(_g = (_f = req.user) === null || _f === void 0 ? void 0 : _f._id) === null || _g === void 0 ? void 0 : _g.toString()}`, undefined, { stepId, updates: responses.length });
        res.json(appraisal);
    }
    catch (error) {
        res.status(500).json({ message: 'Error saving committee review', error });
    }
});
exports.saveCommitteeReview = saveCommitteeReview;
// Save Individual Commendation
const saveCommendation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { stepId, comment } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        const review = appraisal.reviews.find(r => r.stepId === stepId);
        if (!review)
            return res.status(404).json({ message: 'Review step not found' });
        review.commendations = review.commendations || [];
        // Check if user already has a commendation
        const existingIndex = review.commendations.findIndex(c => c.userId.toString() === (userId === null || userId === void 0 ? void 0 : userId.toString()));
        if (existingIndex >= 0) {
            review.commendations[existingIndex].comment = comment;
            review.commendations[existingIndex].submittedAt = new Date();
        }
        else {
            review.commendations.push({
                userId: userId,
                comment,
                submittedAt: new Date()
            });
        }
        yield appraisal.save();
        res.json(appraisal);
    }
    catch (error) {
        res.status(500).json({ message: 'Error saving commendation', error });
    }
});
exports.saveCommendation = saveCommendation;
// Admin Edit Appraisal (Post-completion override)
const adminEditAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { id } = req.params;
        const { reviews, overallScore, finalComments } = req.body;
        // Permission check
        if (!['hr_admin', 'appraisal_committee', 'super_admin'].includes(((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || '')) {
            return res.status(403).json({ message: 'Not authorized to edit completed appraisals' });
        }
        const appraisal = yield Appraisal_1.default.findById(id);
        if (!appraisal)
            return res.status(404).json({ message: 'Appraisal not found' });
        // Ensure appraisal is completed (or pending_employee_review if we want to allow editing then too, but usually completed)
        // The frontend checks for 'completed', so we'll enforce that or at least allow it.
        // Prepare edit history entry
        // Ideally we diff changes, but for now we just log the event
        const editEntry = {
            editor: (_b = req.user) === null || _b === void 0 ? void 0 : _b._id,
            timestamp: new Date(),
            changes: [] // TODO: Detailed diffing if needed
        };
        // Update adminEditedVersion
        if (!appraisal.adminEditedVersion) {
            appraisal.adminEditedVersion = {
                reviews: [],
                editHistory: []
            };
        }
        // Save old state to history if needed? Or just append to editHistory list
        appraisal.adminEditedVersion.editHistory.push(editEntry);
        // Update fields
        appraisal.adminEditedVersion.reviews = reviews;
        appraisal.adminEditedVersion.overallScore = overallScore;
        appraisal.adminEditedVersion.finalComments = finalComments;
        appraisal.adminEditedVersion.editedBy = req.user._id;
        appraisal.adminEditedVersion.editedAt = new Date();
        appraisal.isAdminEdited = true;
        // Optional: Should we update the MAIN fields too?
        // If reports use main fields, we might want to sync them OR ensure reports check adminEditedVersion.
        // The implementation of reports I saw earlier DOES check adminEditedVersion.
        // So we keep them separate to preserve original history?
        // However, for simplified querying, some systems overwrite.
        // Based on the frontend logic: "Use admin-edited reviews if present; otherwise use original reviews"
        // And report logic: "const overallRating = app.adminEditedVersion?.overallScore ?? app.overallScore"
        // So keeping them separate is correct for this architecture.
        yield appraisal.save();
        // Audit Log
        yield (0, audit_controller_1.createAuditLog)((_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id) === null || _d === void 0 ? void 0 : _d.toString(), 'admin_edit', 'appraisal', appraisal._id.toString(), `Appraisal admin-edited by ${(_e = req.user) === null || _e === void 0 ? void 0 : _e.firstName} ${(_f = req.user) === null || _f === void 0 ? void 0 : _f.lastName}`);
        res.json(appraisal);
    }
    catch (error) {
        console.error('Error in admin edit:', error);
        res.status(500).json({ message: 'Error saving admin edits', error });
    }
});
exports.adminEditAppraisal = adminEditAppraisal;
