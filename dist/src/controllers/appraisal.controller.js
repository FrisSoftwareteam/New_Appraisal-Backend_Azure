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
exports.submitReview = exports.getAppraisalById = exports.getAppraisals = exports.createAppraisal = void 0;
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalFlow_1 = __importDefault(require("../models/AppraisalFlow"));
// Create a new appraisal instance (usually done by HR or auto-generated)
const createAppraisal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const appraisal = new Appraisal_1.default(Object.assign({}, req.body));
        // Set initial step based on flow
        const flow = yield AppraisalFlow_1.default.findById(req.body.flowId);
        if (flow && flow.steps.length > 0) {
            appraisal.currentStepId = flow.steps[0].id || 's1'; // Fallback if no ID
        }
        yield appraisal.save();
        res.status(201).send(appraisal);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.createAppraisal = createAppraisal;
const getAppraisals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const match = {};
        // If not admin/HR, only show own appraisals or where reviewer
        if (req.user && !['system_admin', 'hr_admin', 'hr_officer'].includes(req.user.role)) {
            match.$or = [
                { employeeId: req.user._id },
                { 'reviews.reviewerId': req.user._id },
                { 'selfReview.reviewerId': req.user._id } // Though usually same as employeeId
            ];
        }
        const appraisals = yield Appraisal_1.default.find(match)
            .populate('employeeId', 'firstName lastName email')
            .populate('periodId', 'name')
            .populate('templateId', 'name')
            .populate('flowId', 'name');
        res.send(appraisals);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getAppraisals = getAppraisals;
const getAppraisalById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const appraisal = yield Appraisal_1.default.findById(req.params.id)
            .populate('employeeId')
            .populate('periodId')
            .populate('templateId')
            .populate('flowId');
        if (!appraisal) {
            return res.status(404).send();
        }
        res.send(appraisal);
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getAppraisalById = getAppraisalById;
// Submit a review (Self or Reviewer)
const submitReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { appraisalId } = req.params;
        const { stepId, responses, comments, overallScore } = req.body;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
        const userRole = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const appraisal = yield Appraisal_1.default.findById(appraisalId);
        if (!appraisal) {
            return res.status(404).send({ error: 'Appraisal not found' });
        }
        // Basic validation: Check if it's the correct step
        if (appraisal.currentStepId !== stepId) {
            // Allow updates if it's not completed? For now strict flow.
            // return res.status(400).send({ error: 'Not the current step' });
        }
        const reviewData = {
            reviewerId: userId,
            reviewerRole: userRole,
            stepId,
            responses,
            comments,
            overallScore,
            submittedAt: new Date(),
            status: 'completed'
        };
        // Check if it's self review
        const flow = yield AppraisalFlow_1.default.findById(appraisal.flowId);
        const currentStep = flow === null || flow === void 0 ? void 0 : flow.steps.find(s => { var _a; return s.id === stepId || ((_a = s._id) === null || _a === void 0 ? void 0 : _a.toString()) === stepId; }); // Handle both string and ObjectId IDs if mixed
        if ((currentStep === null || currentStep === void 0 ? void 0 : currentStep.assignedRole) === 'employee') {
            appraisal.selfReview = reviewData;
            appraisal.status = 'in_review';
        }
        else {
            // Check if review already exists, update it, or push new
            const existingIndex = appraisal.reviews.findIndex(r => r.stepId === stepId);
            if (existingIndex >= 0) {
                appraisal.reviews[existingIndex] = reviewData;
            }
            else {
                appraisal.reviews.push(reviewData);
            }
        }
        // Advance workflow
        if (flow) {
            const currentStepIndex = flow.steps.findIndex(s => { var _a; return s.id === stepId || ((_a = s._id) === null || _a === void 0 ? void 0 : _a.toString()) === stepId; });
            if (currentStepIndex >= 0 && currentStepIndex < flow.steps.length - 1) {
                const nextStep = flow.steps[currentStepIndex + 1];
                appraisal.currentStepId = nextStep.id || nextStep._id.toString();
            }
            else if (currentStepIndex === flow.steps.length - 1) {
                appraisal.status = 'completed';
                appraisal.finalScore = overallScore; // Simplistic final score logic
            }
        }
        yield appraisal.save();
        res.send(appraisal);
    }
    catch (error) {
        res.status(400).send(error);
    }
});
exports.submitReview = submitReview;
