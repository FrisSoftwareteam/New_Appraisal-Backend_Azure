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
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authReq = req;
        const currentUser = authReq.user;
        console.log('=== Dashboard Stats Request ===');
        console.log('Current User:', currentUser ? {
            id: currentUser._id,
            email: currentUser.email,
            role: currentUser.role,
            firstName: currentUser.firstName,
            lastName: currentUser.lastName
        } : 'No user found');
        if (!currentUser) {
            return res.status(401).send({ message: 'Unauthorized' });
        }
        // Define roles that should see organization-wide stats
        const adminRoles = ['hr_admin', 'hr_officer', 'super_admin', 'division_head',
            'department_head', 'supervisor', 'unit_head', 'coo', 'appraisal_committee'];
        const isAdmin = adminRoles.includes(currentUser.role);
        console.log('Is Admin?', isAdmin);
        console.log('Routing to:', isAdmin ? 'Organization Stats' : 'Personal Stats');
        if (isAdmin) {
            // Return organization-wide statistics for admin/HR roles
            return getOrganizationStats(req, res);
        }
        else {
            // Return personalized statistics for regular employees
            return getPersonalStats(req, res, currentUser._id);
        }
    }
    catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).send(error);
    }
});
exports.getDashboardStats = getDashboardStats;
// Organization-wide statistics for admin/HR roles
const getOrganizationStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. Summary Stats
    // Count all staff (excluding guests and super_admins if desired, or just guests)
    const totalEmployees = yield User_1.default.countDocuments({ role: { $nin: ['guest', 'super_admin'] } });
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
                },
                totalScore: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$overallScore', 0] }
                }
            }
        },
        { $sort: { total: -1 } },
        { $limit: 5 }
    ]);
    // 3. Workflow Progress
    const workflowStats = yield Appraisal_1.default.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    const workflowSteps = [
        { stepId: "s1", stepName: "Self Assessment", status: "self_appraisal" },
        { stepId: "s2", stepName: "Supervisor Review", status: "manager_appraisal" },
        { stepId: "s3", stepName: "Review", status: "review" },
        { stepId: "s4", stepName: "Completed", status: "completed" },
    ];
    const processedWorkflowStats = workflowSteps.map(step => {
        const match = workflowStats.find(w => w._id === step.status);
        const count = match ? match.count : 0;
        return {
            stepId: step.stepId,
            stepName: step.stepName,
            inProgress: count,
            completed: step.status === 'completed' ? count : 0,
            pending: 0
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
    // 5. Score Distribution
    const scoreDistribution = yield Appraisal_1.default.aggregate([
        { $match: { status: 'completed' } },
        {
            $group: {
                _id: {
                    $switch: {
                        branches: [
                            { case: { $gte: ['$overallScore', 4.5] }, then: '4.5 - 5.0' },
                            { case: { $gte: ['$overallScore', 4.0] }, then: '4.0 - 4.4' },
                            { case: { $gte: ['$overallScore', 3.5] }, then: '3.5 - 3.9' },
                            { case: { $gte: ['$overallScore', 3.0] }, then: '3.0 - 3.4' },
                        ],
                        default: 'Below 3.0'
                    }
                },
                count: { $sum: 1 }
            }
        }
    ]);
    // 6. Periods
    const periods = yield AppraisalPeriod_1.default.find().sort({ startDate: -1 }).limit(5);
    // 7. Recent Activity
    const recentActivity = yield AuditLog_1.default.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'firstName lastName avatar');
    // Set cache control headers to prevent caching user-specific data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
            completed: d.completed,
            avgScore: d.completed > 0 ? parseFloat((d.totalScore / d.completed).toFixed(1)) : 0
        })),
        workflow: processedWorkflowStats,
        pendingReviews: recentPending,
        scoreDistribution: scoreDistribution.map(s => ({ range: s._id, count: s.count })),
        periods,
        recentActivity,
        isPersonal: false
    });
});
// Personal statistics for regular employees
const getPersonalStats = (req, res, userId) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. My Appraisals Summary
    const myAppraisals = yield Appraisal_1.default.find({ employee: userId });
    const myPendingAppraisals = yield Appraisal_1.default.countDocuments({
        employee: userId,
        status: { $in: ['setup', 'self_appraisal', 'manager_appraisal', 'review'] }
    });
    const myCompletedAppraisals = yield Appraisal_1.default.countDocuments({
        employee: userId,
        status: 'completed'
    });
    // My Average Score
    const myCompleted = yield Appraisal_1.default.find({ employee: userId, status: 'completed' });
    const myTotalScore = myCompleted.reduce((acc, curr) => acc + (curr.overallScore || 0), 0);
    const myAverageScore = myCompleted.length > 0 ? myTotalScore / myCompleted.length : 0;
    const myCompletionRate = (myAppraisals.length > 0) ? (myCompletedAppraisals / myAppraisals.length) * 100 : 0;
    // 2. My Workflow Progress
    const myWorkflowStats = yield Appraisal_1.default.aggregate([
        { $match: { employee: userId } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    const workflowSteps = [
        { stepId: "s1", stepName: "Self Assessment", status: "self_appraisal" },
        { stepId: "s2", stepName: "Supervisor Review", status: "manager_appraisal" },
        { stepId: "s3", stepName: "Review", status: "review" },
        { stepId: "s4", stepName: "Completed", status: "completed" },
    ];
    const processedWorkflowStats = workflowSteps.map(step => {
        const match = myWorkflowStats.find(w => w._id === step.status);
        const count = match ? match.count : 0;
        return {
            stepId: step.stepId,
            stepName: step.stepName,
            inProgress: count,
            completed: step.status === 'completed' ? count : 0,
            pending: 0
        };
    });
    // 3. My Recent Appraisals
    const myRecentAppraisals = yield Appraisal_1.default.find({ employee: userId })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('employee', 'firstName lastName department avatar')
        .populate('workflow', 'name');
    // 4. My Periods (Active ones)
    const myPeriods = yield AppraisalPeriod_1.default.find({ status: { $in: ['active', 'extended'] } }).sort({ startDate: -1 });
    const responseData = {
        summary: {
            totalEmployees: 1, // Just me
            pendingAppraisals: myPendingAppraisals,
            completedAppraisals: myCompletedAppraisals,
            averageScore: parseFloat(myAverageScore.toFixed(2)),
            completionRate: parseFloat(myCompletionRate.toFixed(2))
        },
        departments: [], // Not relevant for personal view
        workflow: processedWorkflowStats,
        pendingReviews: myRecentAppraisals,
        scoreDistribution: [], // Not relevant
        periods: myPeriods,
        recentActivity: [], // Not relevant
        isPersonal: true
    };
    // Set cache control headers to prevent caching user-specific data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    console.log('Sending Personal Stats Response with isPersonal:', responseData.isPersonal);
    res.send(responseData);
});
