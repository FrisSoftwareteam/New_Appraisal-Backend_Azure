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
    response: { type: mongoose_1.Schema.Types.Mixed, required: true }, // string or number
    score: { type: Number },
    comment: { type: String },
}, { _id: false });
const AppraisalReviewSchema = new mongoose_1.Schema({
    reviewerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerRole: { type: String, required: true },
    stepId: { type: String, required: true },
    responses: [AppraisalResponseSchema],
    overallScore: { type: Number },
    comments: { type: String },
    submittedAt: { type: Date },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed", "skipped"],
        default: "pending"
    },
}, { _id: false });
const AppraisalSchema = new mongoose_1.Schema({
    employeeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    periodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AppraisalPeriod', required: true },
    templateId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AppraisalTemplate', required: true },
    flowId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'AppraisalFlow', required: true },
    status: {
        type: String,
        enum: ["not_started", "self_review", "in_review", "completed", "cancelled"],
        default: "not_started"
    },
    currentStepId: { type: String },
    selfReview: AppraisalReviewSchema,
    reviews: [AppraisalReviewSchema],
    finalScore: { type: Number },
}, { timestamps: true });
exports.default = mongoose_1.default.model('Appraisal', AppraisalSchema);
