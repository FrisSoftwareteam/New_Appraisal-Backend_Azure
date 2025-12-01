import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import User, { UserRole } from '../models/User';

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

        // Validate required fields
        if (!email || !fullnames || !department) {
          console.warn(`Skipping row due to missing required fields (email, fullnames, or department)`);
          results.errors++;
          continue;
        }

        // Parse fullnames into firstName and lastName
        const nameParts = fullnames.trim().split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

        const existingUser = await User.findOne({ email });

        if (existingUser) {
          existingUser.firstName = firstName;
          existingUser.lastName = lastName;
          existingUser.department = department;
          if (division) existingUser.division = division;
          if (grade) existingUser.grade = grade;
          existingUser.role = roleFromExcel as UserRole;
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
