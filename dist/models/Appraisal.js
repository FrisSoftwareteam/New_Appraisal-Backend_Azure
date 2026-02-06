"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const AppraisalResponseSchema = new mongoose_1.Schema({
    questionId: { type: String, required: true },
    response: { type: mongoose_1.Schema.Types.Mixed, required: true },
    score: { type: Number },
    comment: { type: String },
}, { _id: false });
const AppraisalReviewSchema = new mongoose_1.Schema({
    stepId: { type: String, required: true },
    reviewerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerRole: { type: String, required: true },
    responses: [AppraisalResponseSchema],
    overallScore: { type: Number },
    comments: { type: String },
    submittedAt: { type: Date },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed", "skipped"],
        default: "pending"
    },
    // Committee specific fields
    isCommittee: { type: Boolean, default: false },
    committeeMembers: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    commendations: [{
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            comment: { type: String },
            submittedAt: { type: Date, default: Date.now }
        }],
    changeLog: [{
            questionId: { type: String },
            oldValue: { type: mongoose_1.Schema.Types.Mixed },
            newValue: { type: mongoose_1.Schema.Types.Mixed },
            changedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            timestamp: { type: Date, default: Date.now }
        }]
}, { _id: false });
const StepAssignmentSchema = new mongoose_1.Schema({
    stepId: { type: String, required: true },
    assignedUser: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed", "skipped"],
        default: "pending"
    }
}, { _id: false });
const AppraisalSchema = new mongoose_1.Schema({
    employee: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    template: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AppraisalTemplate', required: true },
    workflow: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AppraisalFlow', required: true },
    period: { type: String, required: true },
    status: {
        type: String,
        enum: ['setup', 'in_progress', 'completed', 'cancelled', 'pending_employee_review'],
        default: 'setup'
    },
    currentStep: { type: Number, default: 0 },
    stepAssignments: [StepAssignmentSchema],
    reviews: [AppraisalReviewSchema],
    history: [{
            action: { type: String, required: true },
            actor: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            timestamp: { type: Date, default: Date.now },
            comment: { type: String }
        }],
    overallScore: { type: Number },
    finalComments: { type: String },
    rejectionReason: { type: String }, // To store the latest rejection reason for easy UI display
    // Committee Review Fields
    lockedQuestions: [{
            questionId: { type: String, required: true },
            lockedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
            lockedAt: { type: Date, default: Date.now }
        }],
    // Post-Completion Admin Editing
    adminEditedVersion: {
        reviews: [AppraisalReviewSchema],
        overallScore: { type: Number },
        finalComments: { type: String },
        editedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
        editedAt: { type: Date },
        editHistory: [{
                editor: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
                timestamp: { type: Date, default: Date.now },
                changes: [{
                        field: { type: String, required: true },
                        oldValue: { type: mongoose_1.Schema.Types.Mixed },
                        newValue: { type: mongoose_1.Schema.Types.Mixed }
                    }]
            }]
    },
    isAdminEdited: { type: Boolean, default: false },
}, { timestamps: true });
// Add index for locking to easily find expired locks if needed
AppraisalSchema.index({ "lockedQuestions.lockedAt": 1 });
exports.default = mongoose_1.default.model('Appraisal', AppraisalSchema);
