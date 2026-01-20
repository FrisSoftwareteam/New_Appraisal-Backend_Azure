import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
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

    // Helper: Find Recommendation Answer
    // Logic: Look for questions containing "Recommendation" in the text (we might need to fetch template, 
    // but for now let's rely on finding it in the reviews if we assume standard naming, 
    // or better, fetch the template to get the specific question ID).
    // Actually, finding it dynamically per appraisal is safer if templates vary.
    // We'll search through the reviews for a question text that matches "Recommendation".
    // Since review only stores questionId, we ideally need the template. 
    // Optimization: Fetch unique templates used in these appraisals.
    
    // Get unique template IDs
    const templateIds = [...new Set(appraisals.map(a => String(a.template)))];
    const templates = await mongoose.model('AppraisalTemplate').find({ _id: { $in: templateIds } }).lean();
    
    // Map of TemplateID -> { appraiserRecQuestionId, committeeRecQuestionId }
    const templateRecMap: Record<string, { appraiser: string, committee: string }> = {};

    templates.forEach((t: any) => {
        let appraiserQ = '';
        let committeeQ = '';
        
        // Flatten questions to find recommendation ones
        // Assuming 'sections' structure
        t.sections?.forEach((sec: any) => {
            sec.questions?.forEach((q: any) => {
                const text = (q.text || '').toLowerCase(); // Safe check
                if (text.includes('recommendation') || text.includes('appraiser recommendation')) {
                    // Start simple: assume if it's in a normal section it's appraiser
                    appraiserQ = q.id;
                }
            });
        });
        
        templateRecMap[String(t._id)] = { appraiser: appraiserQ, committee: committeeQ };
    });


    const reportData = appraisals.map((app: any) => {
        const emp = app.employee as any;
        if (!emp) return null;

        // Effective Overall Score (Admin edit overrides)
        const overallRating = app.adminEditedVersion?.overallScore ?? app.overallScore ?? '';

        // Find Recommendations
        // We iterate through reviews to find the recommendation.
        // "Appraiser" -> Role "supervisor" or "reviewer" (first level)
        // "Committee" -> Role "appraisal_committee" or similar
        
        let appraiserRec = '';
        let committeeRec = '';

        // Sort reviews by date? Or just find by role.
        // Appraiser Recommendation
         const appraiserReview = (app.reviews || []).find((r: any) => 
            ['supervisor', 'reviewer', 'unit_head', 'department_head'].includes(r.reviewerRole) 
            && r.status === 'completed'
        );
        
        // Committee Recommendation
        // Check adminEditedVersion first for committee rec if overridden? 
        // Or look in reviews for committee role.
        const committeeReview = (app.reviews || []).find((r: any) => 
            ['appraisal_committee', 'super_admin', 'hr_admin'].includes(r.reviewerRole)
            && r.isCommittee
        );

        // Extract answer for "Recommendation" question. 
        // We need to know WHICH question is the recommendation one.
        // If we can't be sure of ID, checking question LABEL would be best but we only have ID in review.
        // We rely on the templateRecMap we built earlier.
        const tId = String(app.template);
        const recQId = templateRecMap[tId]?.appraiser; // Assuming same question ID used? 
        
        // Helper to find response by ID
        const findResponse = (review: any, qId: string) => {
             if (!review || !qId || !review.responses) return '';
             const resp = review.responses.find((r: any) => r.questionId === qId);
             return resp ? resp.response : '';
        };

        // If specific committee question exists, use it. Else assume same question answered by committee.
        appraiserRec = findResponse(appraiserReview, recQId);
        committeeRec = findResponse(committeeReview, recQId); // Try same QID for committee

        // Fallback: If committee wrote to a different question? (e.g. "Committee Recommendation")
        // This logic might need strict IDs from USER in real world, but this is "best effort" auto-detection.
        
        return {
            "Employee ID": emp.id || 'N/A',
            "Full Name": `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unknown',
            "Department": emp.department || '',
            "Grade": emp.grade || '',
            "Date of Birth": formatDate(emp.dateOfBirth),
            "Age": calculateAge(emp.dateOfBirth),
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
