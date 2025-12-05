import { Request, Response } from 'express';
import Appraisal from '../models/Appraisal';
import User from '../models/User';
import mongoose from 'mongoose';

export const getReportStats = async (req: Request, res: Response) => {
  try {
    const { period } = req.query;

    if (!period) {
      return res.status(400).json({ message: 'Period is required' });
    }

    // 1. Overall Status Counts
    const statusCounts = await Appraisal.aggregate([
      { $match: { period } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Format status counts object
    const statusMap = statusCounts.reduce((acc: any, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // 2. Average Scores by Department
    // We need to lookup the employee to get their department
    const deptAverages = await Appraisal.aggregate([
      { $match: { period, status: 'completed', overallScore: { $exists: true } } },
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
          averageScore: { $avg: '$overallScore' },
          count: { $sum: 1 }
        }
      },
      { $sort: { averageScore: -1 } }
    ]);

    // 3. Score Distribution (e.g., <50, 50-70, 70-90, >90)
    const scoreDistribution = await Appraisal.aggregate([
        { $match: { period, status: 'completed', overallScore: { $exists: true } } },
        {
            $bucket: {
                groupBy: "$overallScore",
                boundaries: [0, 50, 70, 90, 101], // 101 to include 100
                default: "Other",
                output: {
                    count: { $sum: 1 }
                }
            }
        }
    ]);

    // 4. completion rate over time (simplified: just total vs completed)
    const totalAppraisals = await Appraisal.countDocuments({ period });
    const completedAppraisals = await Appraisal.countDocuments({ period, status: 'completed' });

    res.json({
      period,
      statusCounts: statusMap,
      departmentPerformance: deptAverages,
      scoreDistribution,
      summary: {
        total: totalAppraisals,
        completed: completedAppraisals,
        completionRate: totalAppraisals > 0 ? (completedAppraisals / totalAppraisals) * 100 : 0
      }
    });

  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ message: 'Error fetching report stats' });
  }
};
