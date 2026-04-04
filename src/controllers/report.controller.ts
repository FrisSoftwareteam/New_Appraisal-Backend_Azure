import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import Appraisal from '../models/Appraisal';
import User from '../models/User';
import mongoose from 'mongoose';
import AppraisalPeriod from '../models/AppraisalPeriod';
import AttendanceRecord from '../models/AttendanceRecord';
import { summarizeAttendance } from '../utils/attendance-metrics';

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

// Export detailed report
export const exportReport = async (req: Request, res: Response) => {
  try {
    const { period } = req.query;

    if (!period) {
      return res.status(400).json({ message: 'Period is required' });
    }

    let periodName = String(period);
    // Resolve period name if ID
    if (mongoose.Types.ObjectId.isValid(periodName)) {
        const pDoc = await AppraisalPeriod.findById(periodName);
        if (pDoc) periodName = pDoc.name;
    }

    // Fetch all appraisals for the period, populated with employee details
    const appraisals = await Appraisal.find({ period: periodName })
      .populate('employee')
      .lean();

    // Helper: Calculate Age
    const calculateAge = (dob?: Date) => {
        if (!dob) return '';
        const birthDate = new Date(dob);
        if (isNaN(birthDate.getTime())) return ''; // Handle invalid dates
        
        const diff = Date.now() - birthDate.getTime();
        const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        return age >= 0 ? age : ''; // Prevent negative age if DOB is future
    };

    // Helper: Safe Date Format
    const formatDate = (date?: Date | string) => {
        if (!date) return '';
        const d = new Date(date);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
    };

    // We will use hardcoded question ID "q21" as requested for recommendations.


    const reportData = appraisals.map((app: any) => {
        const emp = app.employee as any;
        if (!emp) return null;

        // Effective Overall Score (Admin edit overrides)
        const overallRating = app.adminEditedVersion?.overallScore ?? app.overallScore ?? '';

        let appraiserRec = '';
        let committeeRec = '';

        // Appraiser Recommendation: Search backward from main reviews for the first "q21"
        const reviews = app.reviews || [];
        for (let i = reviews.length - 1; i >= 0; i--) {
            const resp = (reviews[i].responses || []).find((r: any) => r.questionId === 'q21');
            if (resp) {
                appraiserRec = String(resp.response);
                break;
            }
        }

        // Committee Recommendation: Search backward from adminEditedVersion reviews for the first "q21"
        const adminReviews = (app.adminEditedVersion?.reviews || []);
        for (let i = adminReviews.length - 1; i >= 0; i--) {
            const resp = (adminReviews[i].responses || []).find((r: any) => r.questionId === 'q21');
            if (resp) {
                committeeRec = String(resp.response);
                break;
            }
        }

        let trainingNeeded = '';
        let trainingRecommended = '';

        // Training Needed: Latest review with q1766971270364
        for (let i = reviews.length - 1; i >= 0; i--) {
            const resp = (reviews[i].responses || []).find((r: any) => r.questionId === 'q1766971270364');
            if (resp) {
                trainingNeeded = String(resp.response);
                break;
            }
        }

        // Training Recommended: Latest admin review with q1766971484543
        for (let i = adminReviews.length - 1; i >= 0; i--) {
            const resp = (adminReviews[i].responses || []).find((r: any) => r.questionId === 'q1766971484543');
            if (resp) {
                trainingRecommended = String(resp.response);
                break;
            }
        }
        
        return {
            "Employee ID": emp.id || 'N/A',
            "Full Name": `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unknown',
            "Department": emp.department || '',
            "Grade": emp.grade || '',
            "Ranking": emp.ranking || '',
            "Date of Birth": formatDate(emp.dateOfBirth),
            "Age": calculateAge(emp.dateOfBirth),
            "Date Employed": formatDate(emp.dateEmployed),
            "Date Confirmed": formatDate(emp.dateConfirmed),
            "Date of Last Promotion": formatDate(emp.dateOfLastPromotion),
             // Join array items with comma
            "Educational Qualifications": Array.isArray(emp.educationalQualifications) ? emp.educationalQualifications.join(', ') : '',
            "Professional Certifications": Array.isArray(emp.professionalCertifications) ? emp.professionalCertifications.join(', ') : '',
            "Previous Year Rating": emp.previousYearRating || '',
            "MD Recommendation (Prev Year)": emp.mdRecommendationPreviousYear || '',
            "Overall Appraisal Rating": overallRating !== '' ? overallRating : 'Not Graded',
            "Appraiser Recommendation": appraiserRec || '-',
            "Committee Recommendation": committeeRec || '-',
            "Training Needed by Employee": trainingNeeded || '-',
            "Training Recommended by Appraiser": trainingRecommended || '-',
            "Status": app.status || 'Unknown'
        };
    }).filter(Boolean); // Remove nulls

    // Generate Excel
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(reportData);
    xlsx.utils.book_append_sheet(wb, ws, "Appraisal Report");

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Appraisal_Report_${periodName}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Error generating report' });
  }
};

// Export Attendance & Punctuality Report
export const getAttendanceReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required (YYYY-MM-DD)' });
    }

    const query: any = {
      dateKey: { $gte: String(startDate), $lte: String(endDate) }
    };

    if (userId && userId !== 'all') {
      query.userId = userId;
    }

    // Fetch records populated with user details
    const records = await AttendanceRecord.find(query)
      .populate('userId', 'firstName lastName department email role')
      .sort({ dateKey: 1, checkInAt: 1 })
      .lean();

    // Helper: Safe Time Format
    const formatTime = (date?: Date) => {
      if (!date) return '';
      const d = new Date(date);
      return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Prepare Detailed Log Data
    const detailedLog = records.map((rec: any) => ({
      "Date": rec.dateKey,
      "Employee Name": `${rec.userId?.firstName || ''} ${rec.userId?.lastName || ''}`.trim() || rec.userName,
      "Department": rec.userId?.department || rec.department || '',
      "Clock In": formatTime(rec.checkInAt),
      "Clock Out": formatTime(rec.checkOutAt),
      "Status": rec.checkInStatus === 'on-time' ? 'On-time' : 'Late',
      "Location": rec.locationLabel || '',
      "Flags": rec.flagStatus !== 'clear' ? `${rec.flagStatus}: ${rec.flagReason || ''}` : ''
    }));

    // Prepare Staff Summary Data
    // Group records by userId to calculate summary stats
    const staffMap = new Map();
    records.forEach((rec: any) => {
      const uId = rec.userId?._id?.toString() || 'unknown';
      if (!staffMap.has(uId)) {
        staffMap.set(uId, {
          user: rec.userId,
          records: []
        });
      }
      staffMap.get(uId).records.push(rec);
    });

    const staffSummary = Array.from(staffMap.values()).map(({ user, records }) => {
      const stats = summarizeAttendance(records);
      return {
        "Employee Name": `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown',
        "Department": user?.department || '',
        "Total Days": stats.attendanceDays,
        "On-time Days": stats.onTimeDays,
        "Late Days": stats.lateDays,
        "Punctuality %": `${stats.punctualityRate}%`,
        "Avg Clock-in": stats.averageCheckInTime || 'N/A',
        "Avg Clock-out": stats.averageCheckOutTime || 'N/A',
        "Avg Work Hours": stats.averageWorkHours || 'N/A'
      };
    });

    // Generate Excel
    const wb = xlsx.utils.book_new();
    
    // Summary Sheet
    const wsSummary = xlsx.utils.json_to_sheet(staffSummary);
    xlsx.utils.book_append_sheet(wb, wsSummary, "Staff Summary");

    // Detailed Log Sheet
    const wsDetailed = xlsx.utils.json_to_sheet(detailedLog);
    xlsx.utils.book_append_sheet(wb, wsDetailed, "Detailed Attendance Log");

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = userId && userId !== 'all' && staffSummary.length > 0
      ? `Attendance_Report_${staffSummary[0]["Employee Name"].replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`
      : `Attendance_Report_All_Staff_${startDate}_to_${endDate}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);

  } catch (error) {
    console.error('Attendance Export error:', error);
    res.status(500).json({ message: 'Error generating attendance report' });
  }
};
