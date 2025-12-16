import { Request, Response } from 'express';
import Appraisal from '../models/Appraisal';
import User from '../models/User';
import mongoose from 'mongoose';
import AppraisalPeriod from '../models/AppraisalPeriod';

// Return available periods derived from appraisals (fallback when /periods is empty)
export const getReportPeriods = async (req: Request, res: Response) => {
  try {
    const periods = await Appraisal.aggregate([
      {
        $group: {
          _id: '$period',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const mapped = periods.map((p) => ({
      id: String(p._id),
      name: String(p._id),
      count: p.count,
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Error fetching report periods:', error);
    res.status(500).json({ message: 'Error fetching report periods' });
  }
};

// ... (existing imports)

export const getReportStats = async (req: Request, res: Response) => {
  try {
    const { period } = req.query;

    if (!period) {
      return res.status(400).json({ message: 'Period is required' });
    }

    let periodName = String(period);

    // If the provided period is a valid ObjectId, try to find its name
    if (mongoose.Types.ObjectId.isValid(periodName)) {
      const periodDoc = await AppraisalPeriod.findById(periodName);
      if (periodDoc) {
        periodName = periodDoc.name;
      }
    }

    const periodMatch = { period: periodName };

    // Common addFields to prefer admin-edited overallScore when present
    const withEffectiveScore = [
      {
        $addFields: {
          effectiveScore: {
            $ifNull: ['$adminEditedVersion.overallScore', '$overallScore']
          }
        }
      }
    ]

    // 1. Overall Status Counts
    const statusCounts = await Appraisal.aggregate([
      { $match: periodMatch },
      ...withEffectiveScore,
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
      { $match: { ...periodMatch, status: 'completed' } },
      ...withEffectiveScore,
      { $match: { effectiveScore: { $ne: null } } },
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
          averageScore: { $avg: '$effectiveScore' },
          count: { $sum: 1 }
        }
      },
      { $sort: { averageScore: -1 } }
    ]);

    // 3. Score Distribution (e.g., <50, 50-70, 70-90, >90)
    const scoreDistribution = await Appraisal.aggregate([
      { $match: { ...periodMatch, status: 'completed' } },
      ...withEffectiveScore,
      { $match: { effectiveScore: { $ne: null } } },
      {
        $bucket: {
          groupBy: "$effectiveScore",
          boundaries: [0, 50, 70, 90, 101], // 101 to include 100
          default: "Other",
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    // 4. completion rate over time (simplified: just total vs completed)
    const totalAppraisals = await Appraisal.countDocuments(periodMatch);
    const completedAppraisals = await Appraisal.countDocuments({ ...periodMatch, status: 'completed' });

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
