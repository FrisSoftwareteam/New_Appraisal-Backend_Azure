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
const UserSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: {
        type: String,
        enum: [
            "super_admin",
            "hr_admin",
            "hr_officer",
            "division_head",
            "department_head",
            "supervisor",
            "unit_head",
            "coo",
            "appraisal_committee",
            "employee",
            "guest"
        ],
        default: "employee"
    },
    accessLevel: { type: Number, required: true, default: 1 },
    department: { type: String, required: true },
    division: { type: String, required: true },
    unit: { type: String },
    grade: { type: String, required: true },
    jobTitle: { type: String },
    designation: { type: String },
    gender: { type: String },
    ranking: { type: String },
    category: { type: String },
    dateConfirmed: { type: Date },
    dateOfLastPromotion: { type: Date },
    dateEmployed: { type: Date },
    dateOfBirth: { type: Date },
    previousYearRating: { type: String },
    mdRecommendationPreviousYear: { type: String },
    educationalQualifications: [{ type: String }],
    professionalCertifications: [{ type: String }],
    trainingsAttended: [{
            title: { type: String },
            year: { type: Number }
        }],
    careerDevelopment: [{
            note: { type: String },
            year: { type: Number }
        }],
    rolesAndResponsibilities: { type: String },
    supervisor: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    avatar: { type: String },
    isFirstLogin: { type: Boolean, default: true },
}, { timestamps: true });
exports.default = mongoose_1.default.model('User', UserSchema);
