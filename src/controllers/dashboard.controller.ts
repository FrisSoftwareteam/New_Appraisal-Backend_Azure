import { Request, Response } from 'express';
import User from '../models/User';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth.middleware';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
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
    } else {
      // Return personalized statistics for regular employees
      return getPersonalStats(req, res, currentUser._id);
    }
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).send(error);
  }
};

// Organization-wide statistics for admin/HR roles
const getOrganizationStats = async (req: Request, res: Response) => {
  // 1. Summary Stats
  // Count all staff (excluding guests and super_admins if desired, or just guests)
  const totalEmployees = await User.countDocuments({ role: { $nin: ['guest', 'super_admin'] } });
  const pendingAppraisals = await Appraisal.countDocuments({ 
    status: { $in: ['setup', 'self_appraisal', 'manager_appraisal', 'review'] } 
  });
  const completedAppraisals = await Appraisal.countDocuments({ status: 'completed' });
  
  // Average Score
  const completed = await Appraisal.find({ status: 'completed' });
  const totalScore = completed.reduce((acc, curr) => acc + (curr.overallScore || 0), 0);
  const averageScore = completed.length > 0 ? totalScore / completed.length : 0;
  
  const completionRate = (totalEmployees > 0) ? (completedAppraisals / totalEmployees) * 100 : 0;

  // 2. Department Breakdown
  const departmentStats = await Appraisal.aggregate([
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
  const workflowStats = await Appraisal.aggregate([
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
  const recentPending = await Appraisal.find({ 
    status: { $in: ['self_appraisal', 'manager_appraisal', 'review'] } 
  })
  .sort({ updatedAt: -1 })
  .limit(5)
  .populate('employee', 'firstName lastName department avatar')
  .populate('workflow', 'name');

  // 5. Score Distribution
  const scoreDistribution = await Appraisal.aggregate([
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
  const periods = await AppraisalPeriod.find().sort({ startDate: -1 }).limit(5);

  // 7. Recent Activity
  const recentActivity = await AuditLog.find()
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
};

// Personal statistics for regular employees
const getPersonalStats = async (req: Request, res: Response, userId: any) => {
  // 1. My Appraisals Summary
  const myAppraisals = await Appraisal.find({ employee: userId });
  const myPendingAppraisals = await Appraisal.countDocuments({ 
    employee: userId,
    status: { $in: ['setup', 'self_appraisal', 'manager_appraisal', 'review'] } 
  });
  const myCompletedAppraisals = await Appraisal.countDocuments({ 
    employee: userId,
    status: 'completed' 
  });
  
  // My Average Score
  const myCompleted = await Appraisal.find({ employee: userId, status: 'completed' });
  const myTotalScore = myCompleted.reduce((acc, curr) => acc + (curr.overallScore || 0), 0);
  const myAverageScore = myCompleted.length > 0 ? myTotalScore / myCompleted.length : 0;
  
  const myCompletionRate = (myAppraisals.length > 0) ? (myCompletedAppraisals / myAppraisals.length) * 100 : 0;

  // 2. My Workflow Progress
  const myWorkflowStats = await Appraisal.aggregate([
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
  const myRecentAppraisals = await Appraisal.find({ employee: userId })
    .sort({ updatedAt: -1 })
    .limit(5)
    .populate('employee', 'firstName lastName department avatar')
    .populate('workflow', 'name');

  // 4. My Periods (Active ones)
  const myPeriods = await AppraisalPeriod.find({ status: { $in: ['active', 'extended'] } }).sort({ startDate: -1 });

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
};
