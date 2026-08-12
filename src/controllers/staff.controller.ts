import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import User, { UserRole } from '../models/User';
import Grade from '../models/Grade';
import PendingStaff from '../models/PendingStaff';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import { getNonElapsedActivePeriodFilter } from '../utils/period-utils';
import AppraisalTemplate from '../models/AppraisalTemplate';
import LeaveBalance from '../models/LeaveBalance';
import { AuthRequest } from '../middleware/auth.middleware';
import { createAuditLog } from './audit.controller';
import {
  extractTrainingRecommendationSignals,
  getTrainingSignalMap
} from '../services/training.service';

// Get all staff with optional filtering
export const getAllStaff = async (req: Request, res: Response) => {
  try {
    const { search, department, division, grade } = req.query;
    
    // Build query object
    const query: any = {};
    
    // Search by name or email
    if (search && typeof search === 'string') {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by department
    if (department && department !== 'All Departments') {
      query.department = department;
    }
    
    // Filter by division
    if (division && division !== 'All Divisions') {
      query.division = division;
    }
    
    // Filter by grade
    if (grade && grade !== 'All Grades') {
      query.grade = grade;
    }

    // Filter by role
    if (req.query.role) {
      query.role = req.query.role;
    }
    
    const staff = await User.find(query).select('-password').lean();

    // Fetch latest appraisal per staff member. Doing the "latest per employee"
    // reduction in Mongo (rather than pulling every historical appraisal - full
    // nested reviews/history/adminEditedVersion documents - and reducing in JS)
    // avoids transferring the entire appraisal history for every listed employee
    // just to read two response strings off the newest one.
    const staffIds = staff.map(s => s._id);
    const latestAppraisals = await Appraisal.aggregate([
      { $match: { employee: { $in: staffIds } } },
      { $sort: { employee: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$employee',
          appraisalId: { $first: '$_id' },
          period: { $first: '$period' },
          reviews: { $first: '$reviews' },
          adminEditedVersion: { $first: '$adminEditedVersion' },
        },
      },
    ]);

    // Map appraisals to staff for quick lookup
    const appraisalMap = new Map();
    latestAppraisals.forEach(app => {
      appraisalMap.set(String(app._id), app);
    });

    // Shared with the Training module and report exports so a template question-id
    // change is picked up everywhere at once.
    const signalMap = await getTrainingSignalMap();

    const staffWithTraining = staff.map((member: any) => {
      const app = appraisalMap.get(String(member._id));
      const signals = extractTrainingRecommendationSignals(
        app ? { ...app, _id: app.appraisalId } : null,
        signalMap
      );

      return {
        ...member,
        trainingNeededByEmployee: signals.trainingNeededByEmployee,
        trainingRecommendedByAppraiser: signals.trainingRecommendedByAppraiser
      };
    });

    res.status(200).json(staffWithTraining);
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ message: 'Error fetching staff' });
  }
};

// Update staff member
export const updateStaff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.password;
    delete updates.createdAt;
    
    const updatedStaff = await User.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!updatedStaff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    res.status(200).json(updatedStaff);
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(400).json({ message: 'Error updating staff member' });
  }
};

// Delete staff member
export const deleteStaff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const deletedStaff = await User.findByIdAndDelete(id);
    
    if (!deletedStaff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    res.status(200).json({ message: 'Staff member deleted successfully', id });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({ message: 'Error deleting staff member' });
  }
};

// Exclude staff from current appraisal cycle
export const excludeFromCycle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // For now, we'll just verify the user exists
    // In a real implementation, this would update an Appraisal or UserCycle model
    const staff = await User.findById(id);
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff member not found' });
    }
    
    // TODO: Implement actual exclusion logic when Appraisal cycle model is ready
    // For now, just return success
    res.status(200).json({ 
      message: `${staff.firstName} ${staff.lastName} excluded from current cycle`,
      staffId: id 
    });
  } catch (error) {
    console.error('Error excluding staff from cycle:', error);
    res.status(500).json({ message: 'Error excluding staff from cycle' });
  }
};

// Get unique filter options (departments, divisions, grades)
export const getStaffFilters = async (req: Request, res: Response) => {
  try {
    const departments = await User.distinct('department');
    const divisions = await User.distinct('division');
    const [staffGrades, configuredGradeNames] = await Promise.all([
      User.distinct('grade'),
      Grade.distinct('name', { isActive: true }),
    ]);
    const grades = Array.from(new Set([...staffGrades, ...configuredGradeNames]));

    res.status(200).json({
      departments: departments.filter(Boolean).sort(),
      divisions: divisions.filter(Boolean).sort(),
      grades: grades.filter(Boolean).sort()
    });
  } catch (error) {
    console.error('Error fetching staff filters:', error);
    res.status(500).json({ message: 'Error fetching staff filters' });
  }
};

// Helper to safely parse Excel dates or strings
const parseExcelDate = (value: any): Date | undefined => {
  if (!value || value === 'NA' || value === 'N/A') return undefined;
  
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  const str = String(value).trim();
  
  // 1. Try to match regional formats like DD/MM/YYYY or MM/DD/YYYY, ignoring time parts
  const datePartMatch = str.match(/^(\d+)[/.\-](\d+)[/.\-](\d+)/);
  if (datePartMatch) {
    const p1 = parseInt(datePartMatch[1], 10);
    const p2 = parseInt(datePartMatch[2], 10);
    let year = parseInt(datePartMatch[3], 10);
    
    if (year < 100) year += (year < 50 ? 2000 : 1900);
    
    let day, month;
    if (p1 > 12) {
      day = p1;
      month = p2 - 1;
    } else if (p2 > 12) {
      day = p2;
      month = p1 - 1;
    } else {
      // Default to DMY
      day = p1;
      month = p2 - 1;
    }
    
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Fallback to native translation for ISO strings
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    let year = parsed.getFullYear();
    if (year < 100) {
      parsed.setFullYear(year + (year < 50 ? 2000 : 1900));
    }
    return parsed;
  }

  return undefined;
};

export const importStaff = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    console.log(`[ImportStaff] Workbook sheets: ${workbook.SheetNames.join(', ')}`);
    
    // Find first sheet that actually has data
    let sheetName = workbook.SheetNames[0];
    let data: any[] = [];
    
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const rows = xlsx.utils.sheet_to_json(sheet);
      if (rows.length > 0) {
        sheetName = name;
        data = rows;
        break;
      }
    }

    console.log(`[ImportStaff] Using sheet: "${sheetName}" with ${data.length} rows`);

    const results = {
      added: 0,
      updated: 0,
      pending: 0,
      errors: 0,
    };

    for (const row of data as any[]) {
      try {
        // Normalizing headers (aggressive char removal)
        const rowKeys = Object.keys(row);
        const normalizedRow: any = {};
        const unmatchedKeys: string[] = [];

        rowKeys.forEach(key => {
          const cleanKey = key.toLowerCase().replace(/[^a-z]/g, '');
          
          let targetField = '';
          if (cleanKey === 'fullname' || cleanKey === 'fullnames') targetField = 'fullname';
          if (cleanKey === 'emailaddress' || cleanKey === 'email' || cleanKey === 'e-mail') targetField = 'email';
          if (cleanKey === 'department') targetField = 'department';
          if (cleanKey === 'division') targetField = 'division';
          if (cleanKey === 'grade') targetField = 'grade';
          if (cleanKey === 'role') targetField = 'role';
          if (cleanKey === 'jobtitle') targetField = 'jobTitle';
          if (cleanKey === 'designation') targetField = 'designation';
          if (cleanKey === 'gender') targetField = 'gender';
          if (cleanKey === 'supervisor') targetField = 'supervisor';
          if (cleanKey === 'rolesandresponsibilities' || cleanKey.includes('roles')) targetField = 'rolesAndResponsibilities';
          if (cleanKey === 'dateoflastpromotion' || (cleanKey.includes('last') && cleanKey.includes('promotion'))) targetField = 'dateOfLastPromotion';
          if (cleanKey === 'dateemployed' || cleanKey.includes('employed') || cleanKey.includes('employment')) targetField = 'dateEmployed';
          if (cleanKey === 'dateofbirth' || cleanKey === 'dob' || cleanKey.includes('birth')) targetField = 'dateOfBirth';
          if (cleanKey === 'dateconfirmed' || cleanKey.includes('confirmed')) targetField = 'dateConfirmed';
          if (cleanKey.includes('educational')) targetField = 'educationalQualifications';
          if (cleanKey.includes('professional') || cleanKey.includes('certification') || cleanKey.includes('additionalqualification')) targetField = 'professionalCertifications';

          if (targetField) {
            normalizedRow[targetField] = row[key];
          } else {
            unmatchedKeys.push(key);
          }
        });

        // Helper function to parse comma/semicolon-separated lists
        const parseList = (value: any): string[] => {
          if (!value) return [];
          const stringValue = String(value);
          return stringValue.split(/[;,]/).map(item => item.trim()).filter(Boolean);
        };

        const fullnames = normalizedRow.fullname;
        const email = normalizedRow.email;
        const department = normalizedRow.department;
        const division = normalizedRow.division;
        const grade = normalizedRow.grade;
        const roleFromExcel = normalizedRow.role || 'employee';
        const jobTitle = normalizedRow.jobTitle;
        const designation = normalizedRow.designation;
        const gender = normalizedRow.gender;
        const supervisor = normalizedRow.supervisor;
        const rolesAndResponsibilities = normalizedRow.rolesAndResponsibilities;
        const dateOfLastPromotionRaw = normalizedRow.dateOfLastPromotion;
        const dateEmployedRaw = normalizedRow.dateEmployed;
        const dateOfBirthRaw = normalizedRow.dateOfBirth;
        const dateConfirmedRaw = normalizedRow.dateConfirmed;
        const educationalQualifications = normalizedRow.educationalQualifications ? (Array.isArray(normalizedRow.educationalQualifications) ? normalizedRow.educationalQualifications : parseList(normalizedRow.educationalQualifications)) : [];
        const professionalCertifications = normalizedRow.professionalCertifications ? (Array.isArray(normalizedRow.professionalCertifications) ? normalizedRow.professionalCertifications : parseList(normalizedRow.professionalCertifications)) : [];

        // Check for missing required fields
        const missingFields = [];
        if (!email) missingFields.push('email');
        if (!fullnames) missingFields.push('fullnames');
        if (!department) missingFields.push('department');

        if (missingFields.length > 0) {
          // Add to PendingStaff
          const pending = new PendingStaff({
            email,
            firstName: fullnames ? String(fullnames).split(' ')[0] : undefined,
            lastName: fullnames ? (String(fullnames).split(' ').length > 1 ? String(fullnames).split(' ').slice(1).join(' ') : String(fullnames).split(' ')[0]) : undefined,
            role: roleFromExcel,
            department,
            division,
            grade,
            missingFields,
            originalData: row
          });
          await pending.save();
          results.pending++;
          continue;
        }

        // Parse fullnames into firstName and lastName
        const nameParts = String(fullnames).trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

        const existingUser = await User.findOne({ email: String(email).toLowerCase().trim() });

        if (existingUser) {
          existingUser.firstName = firstName;
          existingUser.lastName = lastName;
          existingUser.department = department;
          if (division) existingUser.set('division', String(division));
          if (grade) existingUser.set('grade', String(grade));
          existingUser.role = roleFromExcel as UserRole;
          
          // Update additional fields if provided
          if (jobTitle) existingUser.set('jobTitle', String(jobTitle));
          if (designation) existingUser.set('designation', String(designation));
          if (gender) existingUser.set('gender', String(gender));
          if (supervisor) existingUser.set('supervisor', supervisor); 
          if (rolesAndResponsibilities) existingUser.set('rolesAndResponsibilities', String(rolesAndResponsibilities));
          
          // Use robust date parsing
          if (dateOfLastPromotionRaw) {
             const parsed = parseExcelDate(dateOfLastPromotionRaw);
             if (parsed) {
                existingUser.set('dateOfLastPromotion', parsed);
                console.log(`[ImportStaff] Setting dateOfLastPromotion for ${email} to ${parsed.toISOString()}`);
             }
          }
          if (dateEmployedRaw) {
             const parsed = parseExcelDate(dateEmployedRaw);
             if (parsed) existingUser.set('dateEmployed', parsed);
          }
          if (dateOfBirthRaw) {
             const parsed = parseExcelDate(dateOfBirthRaw);
             if (parsed) existingUser.set('dateOfBirth', parsed);
          }
          if (dateConfirmedRaw) {
             const parsed = parseExcelDate(dateConfirmedRaw);
             if (parsed) existingUser.set('dateConfirmed', parsed);
          }

          if (educationalQualifications.length > 0) existingUser.set('educationalQualifications', educationalQualifications);
          if (professionalCertifications.length > 0) existingUser.set('professionalCertifications', professionalCertifications);
          
          existingUser.updatedAt = new Date();
          
          console.log(`[ImportStaff] Pending save for ${email}. Modified: ${existingUser.modifiedPaths()}`);
          await existingUser.save();
          console.log(`[ImportStaff] Successfully saved ${email}`);
          results.updated++;
        } else {
          const newUser = new User({
            firstName,
            lastName,
            email: String(email).toLowerCase().trim(),
            department,
            division: division || 'Unassigned',
            grade: grade || 'Unassigned',
            role: roleFromExcel as UserRole,
            accessLevel: 1,
            isFirstLogin: true,
            jobTitle: jobTitle ? String(jobTitle) : undefined,
            designation: designation ? String(designation) : undefined,
            gender: gender ? String(gender) : undefined,
            supervisor: supervisor || undefined,
            rolesAndResponsibilities: rolesAndResponsibilities ? String(rolesAndResponsibilities) : undefined,
            dateOfLastPromotion: parseExcelDate(dateOfLastPromotionRaw),
            dateEmployed: parseExcelDate(dateEmployedRaw),
            dateOfBirth: parseExcelDate(dateOfBirthRaw),
            dateConfirmed: parseExcelDate(dateConfirmedRaw),
            educationalQualifications: educationalQualifications.length > 0 ? educationalQualifications : undefined,
            professionalCertifications: professionalCertifications.length > 0 ? professionalCertifications : undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await newUser.save();
          results.added++;
        }
      } catch (error) {
        console.error('Error processing row:', error);
        results.errors++;
      }
    }

    res.status(200).json({
      message: 'Import completed',
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Internal server error during import' });
  }
};

// Get all pending staff
export const getPendingStaff = async (req: Request, res: Response) => {
  try {
    const pending = await PendingStaff.find().sort({ createdAt: -1 });
    res.status(200).json(pending);
  } catch (error) {
    console.error('Error fetching pending staff:', error);
    res.status(500).json({ message: 'Error fetching pending staff' });
  }
};

// Resolve pending staff (move to User)
export const resolvePendingStaff = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, department, division, grade, role } = req.body;

    // Validate required fields again
    if (!firstName || !lastName || !email || !department) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const pending = await PendingStaff.findById(id);
    if (!pending) {
      return res.status(404).json({ message: 'Pending staff record not found' });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Update existing user instead of creating new? Or error?
      // Let's update for now as it might be a correction of an existing user import
      existingUser.firstName = firstName;
      existingUser.lastName = lastName;
      existingUser.department = department;
      existingUser.division = division || existingUser.division;
      existingUser.grade = grade || existingUser.grade;
      existingUser.role = role as UserRole;
      await existingUser.save();
    } else {
      // Create new user
      const newUser = new User({
        firstName,
        lastName,
        email,
        department,
        division: division || 'Unassigned',
        grade: grade || 'Unassigned',
        role: role as UserRole || 'employee',
        accessLevel: 1,
        isFirstLogin: true,
      });
      await newUser.save();
    }

    // Delete from PendingStaff
    await PendingStaff.findByIdAndDelete(id);

    res.status(200).json({ message: 'Staff member resolved and added/updated successfully' });
  } catch (error) {
    console.error('Error resolving pending staff:', error);
    res.status(500).json({ message: 'Error resolving pending staff' });
  }
};



// Delete pending staff
export const deletePendingStaff = async (req: Request, res: Response) => {
  try {
    const pending = await PendingStaff.findByIdAndDelete(req.params.id);
    if (!pending) {
      return res.status(404).json({ message: 'Pending staff record not found' });
    }
    res.status(200).json({ message: 'Pending staff record deleted successfully' });
  } catch (error) {
    console.error('Error deleting pending staff:', error);
    res.status(500).json({ message: 'Error deleting pending staff' });
  }
};

// Delete all staff (except current user)
export const deleteAllStaff = async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?._id;
    
    // Find users to delete first to get their IDs
    const usersToDelete = await User.find({ _id: { $ne: currentUserId } }).select('_id');
    const userIds = usersToDelete.map(u => u._id);
    
    if (userIds.length > 0) {
      // Delete associated appraisals
      await Appraisal.deleteMany({ employee: { $in: userIds } });
      
      // Remove from periods and templates
      await AppraisalPeriod.updateMany(
        { assignedEmployees: { $in: userIds } },
        { $pull: { assignedEmployees: { $in: userIds } } }
      );
      
      await AppraisalTemplate.updateMany(
        { assignedUsers: { $in: userIds } },
        { $pull: { assignedUsers: { $in: userIds } } }
      );
      
      // Delete users
      const result = await User.deleteMany({ _id: { $in: userIds } });
      
      // Also clear pending staff
      await PendingStaff.deleteMany({});
      
      res.status(200).json({ 
        message: 'All staff records and associated appraisals deleted successfully', 
        deletedCount: result.deletedCount 
      });
    } else {
      res.status(200).json({ 
        message: 'No staff records to delete', 
        deletedCount: 0 
      });
    }
  } catch (error) {
    console.error('Error deleting all staff:', error);
    res.status(500).json({ message: 'Error deleting all staff' });
  }
};

// Get staff statistics
export const getStaffStats = async (req: Request, res: Response) => {
  try {
    const totalEmployees = await User.countDocuments({ role: { $nin: ['guest', 'super_admin'] } });
    
    // Find active period (excludes elapsed: endDate >= today)
    const activePeriod = await AppraisalPeriod.findOne(getNonElapsedActivePeriodFilter());
    
    let activeInCycle = 0;
    let pendingAssignment = 0;
    
    if (activePeriod) {
      // Count employees assigned to the active period
      activeInCycle = activePeriod.assignedEmployees.length;
      pendingAssignment = Math.max(0, totalEmployees - activeInCycle);
    } else {
      pendingAssignment = totalEmployees;
    }
    
    // For now, excluded is 0 as we don't have an explicit 'excluded' status
    const excluded = 0; 

    res.json({
      totalEmployees,
      activeInCycle,
      excluded,
      pendingAssignment
    });
  } catch (error) {
    console.error('Error fetching staff stats:', error);
    res.status(500).json({ message: 'Error fetching staff stats', error });
  }
};

// Change a single staff member's notch — kept separate from the general updateStaff
// endpoint so it's a distinct, audited HR action rather than folded into profile edits.
export const updateStaffNotch = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { notch } = req.body;

    if (typeof notch !== 'number' || !Number.isInteger(notch) || notch < 0 || notch > 20) {
      return res.status(400).json({ message: 'notch must be an integer between 0 and 20' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const previousNotch = user.notch ?? null;
    user.notch = notch;
    await user.save();

    await createAuditLog(
      req.user!._id.toString(),
      'update',
      'UserNotch',
      id,
      `Changed notch for ${user.firstName} ${user.lastName} from ${previousNotch ?? 'unset'} to ${notch}`,
      { notch: { old: previousNotch, new: notch } }
    );

    res.status(200).json({ message: 'Notch updated successfully', notch: user.notch });
  } catch (error) {
    console.error('Error updating staff notch:', error);
    res.status(500).json({ message: 'Error updating staff notch' });
  }
};

// One-time bulk seed of notch + initial leave-balance carryover for existing staff.
// Mirrors the xlsx-parse-by-email-match shape of bulkUpdateUsers/importStaff above.
export const bulkImportSalaryData = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

    let sheetName = workbook.SheetNames[0];
    let data: any[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const rows = xlsx.utils.sheet_to_json(sheet);
      if (rows.length > 0) {
        sheetName = name;
        data = rows;
        break;
      }
    }
    console.log(`[BulkImportSalaryData] Using sheet: "${sheetName}" with ${data.length} rows`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { email: string; reason: string }[],
    };

    const currentYear = new Date().getFullYear();

    for (const row of data as any[]) {
      const rowKeys = Object.keys(row);
      const findKey = (matcher: (cleanKey: string) => boolean) =>
        rowKeys.find((k) => matcher(k.toLowerCase().replace(/[^a-z]/g, '')));

      const emailKey = findKey((k) => k === 'email' || k === 'emailaddress');
      const email = emailKey ? row[emailKey] : null;

      if (!email) {
        results.failed++;
        results.errors.push({ email: 'Unknown', reason: 'Missing email in row' });
        continue;
      }

      try {
        const user = await User.findOne({ email: String(email).toLowerCase().trim() });
        if (!user) {
          results.failed++;
          results.errors.push({ email, reason: 'User not found' });
          continue;
        }

        const notchKey = findKey((k) => k === 'notch');
        const daysKey = findKey((k) => k.includes('leavedays') && k.includes('carryover'));
        const allowanceKey = findKey((k) => k.includes('allowance') && k.includes('carryover'));
        const yearKey = findKey((k) => k === 'leaveyear' || k === 'year');

        const notchRaw = notchKey ? row[notchKey] : undefined;
        if (notchRaw === undefined || notchRaw === null || notchRaw === '') {
          results.failed++;
          results.errors.push({ email, reason: 'Missing notch value' });
          continue;
        }

        const notch = parseInt(String(notchRaw), 10);
        if (!Number.isInteger(notch) || notch < 0 || notch > 20) {
          results.failed++;
          results.errors.push({ email, reason: `Invalid notch value: ${notchRaw}` });
          continue;
        }

        const yearRaw = yearKey ? row[yearKey] : undefined;
        const leaveYear = yearRaw ? parseInt(String(yearRaw), 10) : currentYear;

        const daysRaw = daysKey ? row[daysKey] : undefined;
        const allowanceRaw = allowanceKey ? row[allowanceKey] : undefined;
        const initialLeaveDaysCarryover = daysRaw !== undefined && daysRaw !== '' ? parseFloat(String(daysRaw)) : 0;
        const initialAllowanceCarryover =
          allowanceRaw !== undefined && allowanceRaw !== '' ? parseFloat(String(allowanceRaw)) : 0;

        user.notch = notch;
        await user.save();

        const existingBalance = await LeaveBalance.findOne({ userId: user._id, leaveYear });
        if (existingBalance && (existingBalance.daysUsed > 0 || existingBalance.allowanceClaimed > 0)) {
          // Balance is already in use this year — leave it alone, notch is still updated above.
          results.success++;
          continue;
        }

        await LeaveBalance.findOneAndUpdate(
          { userId: user._id, leaveYear },
          {
            $set: {
              openingCarryoverDays: initialLeaveDaysCarryover,
              openingCarryoverAllowance: initialAllowanceCarryover,
            },
            $setOnInsert: { daysUsed: 0, allowanceClaimed: 0, allowanceClaimHistory: [] },
          },
          { upsert: true }
        );

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({ email, reason: error.message || 'Update failed' });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Bulk salary data import error:', error);
    res.status(500).json({ message: 'Failed to process bulk salary data import' });
  }
};
