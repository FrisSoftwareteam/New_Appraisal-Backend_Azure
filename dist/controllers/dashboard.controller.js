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
        // 1. Summary Stats
        const totalEmployees = yield User_1.default.countDocuments({ role: 'employee' });
        const pendingAppraisals = yield Appraisal_1.default.countDocuments({
            status: { $in: ['setup', 'self_appraisal', 'manager_appraisal', 'review'] }
        });
        const completedAppraisals = yield Appraisal_1.default.countDocuments({ status: 'completed' });
        // Average Score
        const completed = yield Appraisal_1.default.find({ status: 'completed' });
        const totalScore = completed.reduce((acc, curr) => acc + (curr.overallScore || 0), 0);
        const averageScore = completed.length > 0 ? totalScore / completed.length : 0;
        const completionRate = (totalEmployees > 0) ? (completedAppraisals / totalEmployees) * 100 : 0;
        // 2. Department Breakdown
        // Aggregate appraisals by department (using employee's department)
        // Note: This requires a lookup since department is on the User model
        const departmentStats = yield Appraisal_1.default.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
            {
                $group: {
                    _id: '$employeeDetails.department',
                    total: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 5 }
        ]);
        // 3. Workflow Progress
        // Group by status to show progress
        const workflowStats = yield Appraisal_1.default.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        // Map internal status to workflow steps for display
        const workflowSteps = [
            { stepId: "s1", stepName: "Self Assessment", status: "self_appraisal" },
            { stepId: "s2", stepName: "Supervisor Review", status: "manager_appraisal" },
            { stepId: "s3", stepName: "Review", status: "review" }, // Could be Dept Head / HR
            { stepId: "s4", stepName: "Completed", status: "completed" },
        ];
        const processedWorkflowStats = workflowSteps.map(step => {
            const match = workflowStats.find(w => w._id === step.status);
            const count = match ? match.count : 0;
            // For this simplified view, we'll treat current status count as "in progress" for that step
            // and "completed" would be passed steps. This is an approximation.
            // A better way is to track actual step completion if available.
            return {
                stepId: step.stepId,
                stepName: step.stepName,
                inProgress: count,
                // Mocking completed/pending logic based on flow order for visualization
                completed: step.status === 'completed' ? count : 0,
                pending: 0 // Calculated on frontend or refined here
            };
        });
        // 4. Pending Reviews List
        const recentPending = yield Appraisal_1.default.find({
            status: { $in: ['self_appraisal', 'manager_appraisal', 'review'] }
        })
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName department avatar')
            .populate('workflow', 'name');
        res.send({
            summary: {
                totalEmployees,
                pendingAppraisals,
                completedAppraisals,
                averageScore: parseFloat(averageScore.toFixed(2)),
                completionRate: parseFloat(completionRate.toFixed(2))
            },
            departments: departmentStats.map(d => ({
                name: d._id || 'Unassigned',
                total: d.total,
                completed: d.completed
            })),
            workflow: processedWorkflowStats,
            pendingReviews: recentPending
        });
    }
    catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).send(error);
    }
});
exports.getDashboardStats = getDashboardStats;
