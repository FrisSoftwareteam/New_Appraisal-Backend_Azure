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
exports.getDashboardStats = void 0;
const User_1 = __importDefault(require("../models/User"));
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalEmployees = yield User_1.default.countDocuments({ role: 'employee' });
        const pendingAppraisals = yield Appraisal_1.default.countDocuments({ status: { $in: ['not_started', 'self_review', 'in_review'] } });
        const completedAppraisals = yield Appraisal_1.default.countDocuments({ status: 'completed' });
        // Calculate average score (simplistic)
        const completed = yield Appraisal_1.default.find({ status: 'completed' });
        const totalScore = completed.reduce((acc, curr) => acc + (curr.finalScore || 0), 0);
        const averageScore = completed.length > 0 ? totalScore / completed.length : 0;
        const completionRate = (totalEmployees > 0) ? (completedAppraisals / totalEmployees) * 100 : 0;
        res.send({
            totalEmployees,
            pendingAppraisals,
            completedAppraisals,
            averageScore: parseFloat(averageScore.toFixed(2)),
            completionRate: parseFloat(completionRate.toFixed(2))
        });
    }
    catch (error) {
        res.status(500).send(error);
    }
});
exports.getDashboardStats = getDashboardStats;
