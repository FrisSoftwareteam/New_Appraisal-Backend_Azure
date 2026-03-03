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
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Appraisal_1 = __importDefault(require("../models/Appraisal"));
const AppraisalPeriod_1 = __importDefault(require("../models/AppraisalPeriod"));
const AuditLog_1 = __importDefault(require("../models/AuditLog"));
const ADMIN_ROLES = new Set([
    'hr_admin',
    'hr_officer',
    'super_admin',
    'division_head',
    'department_head',
    'supervisor',
    'unit_head',
    'coo',
    'appraisal_committee'
]);
const PENDING_STATUSES = [
    'setup',
    'self_appraisal',
    'manager_appraisal',
    'review',
    'in_progress',
    'pending_employee_review'
];
const ACTIVE_REVIEW_STATUSES = [
    'self_appraisal',
    'manager_appraisal',
    'review',
    'in_progress',
    'pending_employee_review'
];
const WORKFLOW_STEPS = [
    { stepId: 's1', stepName: 'Self Assessment', statuses: ['setup', 'self_appraisal'] },
    { stepId: 's2', stepName: 'Supervisor Review', statuses: ['manager_appraisal', 'in_progress'] },
    { stepId: 's3', stepName: 'Review', statuses: ['review', 'pending_employee_review'] },
    { stepId: 's4', stepName: 'Completed', statuses: ['completed'] }
];
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).send({ message: 'Unauthorized' });
        }
        if (ADMIN_ROLES.has(currentUser.role)) {
            return getOrganizationStats(res);
        }
        return getPersonalStats(res, currentUser._id);
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        return res.status(500).send(error);
    }
});
exports.getDashboardStats = getDashboardStats;
const getOrganizationStats = (res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const [totalEmployees, statusCounts, completedScoreStats, departmentStats, recentPending, scoreDistribution, periods, recentActivity] = yield Promise.all([
        User_1.default.countDocuments({ role: { $nin: ['guest', 'super_admin'] } }),
        Appraisal_1.default.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]),
        Appraisal_1.default.aggregate([
            {
                $match: {
                    status: 'completed',
                    overallScore: { $type: 'number' }
                }
            },
            {
                $group: {
                    _id: null,
                    averageScore: { $avg: '$overallScore' }
                }
            }
        ]),
        Appraisal_1.default.aggregate([
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
        ]),
        Appraisal_1.default.find({ status: { $in: ACTIVE_REVIEW_STATUSES } })
            .select('_id employee workflow status currentStep updatedAt')
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName department avatar')
            .populate('workflow', 'name')
            .lean(),
        Appraisal_1.default.aggregate([
            { $match: { status: 'completed' } },
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$overallScore', 4.5] }, then: '4.5 - 5.0' },
                                { case: { $gte: ['$overallScore', 4.0] }, then: '4.0 - 4.4' },
                                { case: { $gte: ['$overallScore', 3.5] }, then: '3.5 - 3.9' },
                                { case: { $gte: ['$overallScore', 3.0] }, then: '3.0 - 3.4' }
                            ],
                            default: 'Below 3.0'
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]),
        AppraisalPeriod_1.default.find()
            .select('_id name description status startDate endDate')
            .sort({ startDate: -1 })
            .limit(5)
            .lean(),
        AuditLog_1.default.find()
            .select('_id userId action entityType metadata createdAt')
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('userId', 'firstName lastName avatar')
            .lean()
    ]);
    const completedAppraisals = countByStatus(statusCounts, 'completed');
    const pendingAppraisals = countByStatus(statusCounts, PENDING_STATUSES);
    const averageScore = (_b = (_a = completedScoreStats[0]) === null || _a === void 0 ? void 0 : _a.averageScore) !== null && _b !== void 0 ? _b : 0;
    const completionRate = totalEmployees > 0 ? (completedAppraisals / totalEmployees) * 100 : 0;
    setNoCacheHeaders(res);
    return res.send({
        summary: {
            totalEmployees,
            pendingAppraisals,
            completedAppraisals,
            averageScore: roundToDecimals(averageScore, 2),
            completionRate: roundToDecimals(completionRate, 2)
        },
        departments: departmentStats.map((department) => ({
            name: department._id || 'Unassigned',
            total: department.total,
            completed: department.completed,
            avgScore: department.completed > 0
                ? roundToDecimals(department.totalScore / department.completed, 1)
                : 0
        })),
        workflow: buildWorkflowStats(statusCounts),
        pendingReviews: recentPending,
        scoreDistribution: scoreDistribution.map((item) => ({
            range: item._id,
            count: item.count
        })),
        periods,
        recentActivity,
        isPersonal: false
    });
});
const getPersonalStats = (res, userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const [statusCounts, completedScoreStats, myRecentAppraisals, myPeriods] = yield Promise.all([
        Appraisal_1.default.aggregate([
            { $match: { employee: new mongoose_1.default.Types.ObjectId(userId.toString()) } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]),
        Appraisal_1.default.aggregate([
            {
                $match: {
                    employee: new mongoose_1.default.Types.ObjectId(userId.toString()),
                    status: 'completed',
                    overallScore: { $type: 'number' }
                }
            },
            {
                $group: {
                    _id: null,
                    averageScore: { $avg: '$overallScore' }
                }
            }
        ]),
        Appraisal_1.default.find({ employee: userId })
            .select('_id employee workflow status currentStep updatedAt')
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate('employee', 'firstName lastName department avatar')
            .populate('workflow', 'name')
            .lean(),
        AppraisalPeriod_1.default.find({ status: { $in: ['active', 'extended'] } })
            .select('_id name description status startDate endDate')
            .sort({ startDate: -1 })
            .limit(5)
            .lean()
    ]);
    const myCompletedAppraisals = countByStatus(statusCounts, 'completed');
    const myPendingAppraisals = countByStatus(statusCounts, PENDING_STATUSES);
    const myTotalAppraisals = statusCounts.reduce((total, row) => total + row.count, 0);
    const myAverageScore = (_b = (_a = completedScoreStats[0]) === null || _a === void 0 ? void 0 : _a.averageScore) !== null && _b !== void 0 ? _b : 0;
    const myCompletionRate = myTotalAppraisals > 0 ? (myCompletedAppraisals / myTotalAppraisals) * 100 : 0;
    const responseData = {
        summary: {
            totalEmployees: 1,
            pendingAppraisals: myPendingAppraisals,
            completedAppraisals: myCompletedAppraisals,
            averageScore: roundToDecimals(myAverageScore, 2),
            completionRate: roundToDecimals(myCompletionRate, 2)
        },
        departments: [],
        workflow: buildWorkflowStats(statusCounts),
        pendingReviews: myRecentAppraisals,
        scoreDistribution: [],
        periods: myPeriods,
        recentActivity: [],
        isPersonal: true
    };
    setNoCacheHeaders(res);
    return res.send(responseData);
});
function buildWorkflowStats(statusCounts) {
    return WORKFLOW_STEPS.map((step) => {
        const count = countByStatus(statusCounts, [...step.statuses]);
        return {
            stepId: step.stepId,
            stepName: step.stepName,
            inProgress: count,
            completed: step.stepId === 's4' ? count : 0,
            pending: 0
        };
    });
}
function countByStatus(statusCounts, statuses) {
    const statusList = Array.isArray(statuses) ? statuses : [statuses];
    if (statusList.length === 0) {
        return 0;
    }
    const statusSet = new Set(statusList);
    return statusCounts.reduce((count, row) => (statusSet.has(row._id) ? count + row.count : count), 0);
}
function roundToDecimals(value, decimals) {
    return Number(value.toFixed(decimals));
}
function setNoCacheHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}
