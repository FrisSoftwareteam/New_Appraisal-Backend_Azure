import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import User, { UserRole } from '../models/User';
import PendingStaff from '../models/PendingStaff';
import Appraisal from '../models/Appraisal';
import AppraisalPeriod from '../models/AppraisalPeriod';
import AppraisalTemplate from '../models/AppraisalTemplate';
import { AuthRequest } from '../middleware/auth.middleware';

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
    
    const staff = await User.find(query).select('-password');
    res.status(200).json(staff);
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
    const grades = await User.distinct('grade');
    
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

export const importStaff = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const results = {
      added: 0,
      updated: 0,
      pending: 0,
      errors: 0,
    };

    for (const row of data as any[]) {
      try {
        // Extract fields from the actual Excel format
        const fullnames = row.fullnames || row.fullname || row.name;
        const email = row.EmailAddress || row.email || row.Email;
        const department = row.Department || row.department;
        const division = row.division || row.Division;
        const grade = row.Grade || row.grade;
        const roleFromExcel = row.role || row.Role || 'employee';

        // Check for missing required fields
        const missingFields = [];
        if (!email) missingFields.push('email');
        if (!fullnames) missingFields.push('fullnames');
        if (!department) missingFields.push('department');

        if (missingFields.length > 0) {
          // Add to PendingStaff
          const pending = new PendingStaff({
            email,
            firstName: fullnames ? fullnames.split(' ')[0] : undefined,
            lastName: fullnames ? (fullnames.split(' ').length > 1 ? fullnames.split(' ').slice(1).join(' ') : fullnames.split(' ')[0]) : undefined,
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
        const nameParts = fullnames.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

        const existingUser = await User.findOne({ email });

        // Helper function to parse comma/semicolon-separated lists
        const parseList = (value: any): string[] => {
          if (!value) return [];
          const stringValue = String(value);
          return stringValue.split(/[;,]/).map(item => item.trim()).filter(Boolean);
        };

        // Extract additional fields from Excel
        const jobTitle = row['Job Title'] || row.jobTitle || row.JobTitle;
        const designation = row.Designation || row.designation;
        const gender = row.Gender || row.gender;
        const supervisor = row.Supervisor || row.supervisor;
        const rolesAndResponsibilities = row['Roles and Responsibilities'] || row.rolesAndResponsibilities || row.RolesAndResponsibilities;
        const dateOfLastPromotion = row['Date of Last Promotion'] || row.dateOfLastPromotion || row.DateOfLastPromotion;
        
        // Parse array fields - support both singular and plural forms
        const educationalQualifications = parseList(
          row['Educational Qualification'] || 
          row['Educational Qualifications'] || 
          row.educationalQualification ||
          row.educationalQualifications || 
          row.EducationalQualification ||
          row.EducationalQualifications
        );
        const professionalCertifications = parseList(
          row['Additional Qualification'] ||
          row['Additional Qualifications'] ||
          row['Professional Certification'] ||
          row['Professional Certifications'] || 
          row.additionalQualification ||
          row.additionalQualifications ||
          row.professionalCertification ||
          row.professionalCertifications || 
          row.AdditionalQualification ||
          row.AdditionalQualifications ||
          row.ProfessionalCertification ||
          row.ProfessionalCertifications
        );

        if (existingUser) {
          existingUser.firstName = firstName;
          existingUser.lastName = lastName;
          existingUser.department = department;
          if (division) existingUser.division = division;
          if (grade) existingUser.grade = grade;
          existingUser.role = roleFromExcel as UserRole;
          
          // Update additional fields if provided
          if (jobTitle) existingUser.jobTitle = jobTitle;
          if (designation) existingUser.designation = designation;
          if (gender) existingUser.gender = gender;
          if (supervisor) existingUser.supervisor = supervisor;
          if (rolesAndResponsibilities) existingUser.rolesAndResponsibilities = rolesAndResponsibilities;
          if (dateOfLastPromotion) existingUser.dateOfLastPromotion = new Date(dateOfLastPromotion);
          if (educationalQualifications.length > 0) existingUser.educationalQualifications = educationalQualifications;
          if (professionalCertifications.length > 0) existingUser.professionalCertifications = professionalCertifications;
          
          existingUser.updatedAt = new Date();
          await existingUser.save();
          results.updated++;
        } else {
          const newUser = new User({
            firstName,
            lastName,
            email,
            department,
            division: division || 'Unassigned',
            grade: grade || 'Unassigned',
            role: roleFromExcel as UserRole,
            accessLevel: 1, // Default access level
            isFirstLogin: true,
            // Additional fields
            jobTitle: jobTitle || undefined,
            designation: designation || undefined,
            gender: gender || undefined,
            supervisor: supervisor || undefined,
            rolesAndResponsibilities: rolesAndResponsibilities || undefined,
            dateOfLastPromotion: dateOfLastPromotion ? new Date(dateOfLastPromotion) : undefined,
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
    
    // Find active period
    const activePeriod = await AppraisalPeriod.findOne({ status: 'active' });
    
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
