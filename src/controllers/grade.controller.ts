import { Response } from 'express';
import Grade, { NOTCH_COUNT } from '../models/Grade';
import User from '../models/User';
import SystemSetting from '../models/SystemSetting';
import { AuthRequest } from '../middleware/auth.middleware';
import { getLeaveAllowanceRatePercent } from '../services/salary.service';

const LEAVE_ALLOWANCE_RATE_KEY = 'leaveAllowanceRatePercent';

function validateGradePayload(body: any) {
  const { name, basicSalary, annualLeaveDays, holidayAllowance, notchPercentages } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return 'Grade name is required';
  }
  if (typeof basicSalary !== 'number' || basicSalary < 0) {
    return 'basicSalary must be a non-negative number';
  }
  if (typeof annualLeaveDays !== 'number' || annualLeaveDays < 0) {
    return 'annualLeaveDays must be a non-negative number';
  }
  if (holidayAllowance !== undefined && (typeof holidayAllowance !== 'number' || holidayAllowance < 0)) {
    return 'holidayAllowance must be a non-negative number';
  }
  if (!Array.isArray(notchPercentages) || notchPercentages.length !== NOTCH_COUNT) {
    return `notchPercentages must be an array of exactly ${NOTCH_COUNT} numbers`;
  }
  if (notchPercentages.some((p: any) => typeof p !== 'number' || Number.isNaN(p))) {
    return 'notchPercentages must all be numbers';
  }
  return null;
}

export const getGrades = async (req: AuthRequest, res: Response) => {
  try {
    const grades = await Grade.find().sort({ name: 1 });
    res.json(grades);
  } catch (error) {
    console.error('Error fetching grades:', error);
    res.status(500).json({ message: 'Error fetching grades' });
  }
};

export const getGradeById = async (req: AuthRequest, res: Response) => {
  try {
    const grade = await Grade.findById(req.params.id);
    if (!grade) {
      return res.status(404).json({ message: 'Grade not found' });
    }
    res.json(grade);
  } catch (error) {
    console.error('Error fetching grade:', error);
    res.status(500).json({ message: 'Error fetching grade' });
  }
};

export const createGrade = async (req: AuthRequest, res: Response) => {
  try {
    const validationError = validateGradePayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { name, basicSalary, annualLeaveDays, holidayAllowance, notchPercentages, isActive } = req.body;

    const existing = await Grade.findOne({ name: String(name).trim() });
    if (existing) {
      return res.status(409).json({ message: `A grade named "${name}" already exists` });
    }

    const grade = await Grade.create({
      name: String(name).trim(),
      basicSalary,
      annualLeaveDays,
      holidayAllowance: holidayAllowance ?? 0,
      notchPercentages,
      isActive: isActive ?? true,
    });

    res.status(201).json(grade);
  } catch (error) {
    console.error('Error creating grade:', error);
    res.status(500).json({ message: 'Error creating grade' });
  }
};

export const updateGrade = async (req: AuthRequest, res: Response) => {
  try {
    const validationError = validateGradePayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { name, basicSalary, annualLeaveDays, holidayAllowance, notchPercentages, isActive } = req.body;

    const grade = await Grade.findById(req.params.id);
    if (!grade) {
      return res.status(404).json({ message: 'Grade not found' });
    }

    if (String(name).trim() !== grade.name) {
      const nameClash = await Grade.findOne({ name: String(name).trim(), _id: { $ne: grade._id } });
      if (nameClash) {
        return res.status(409).json({ message: `A grade named "${name}" already exists` });
      }
    }

    grade.name = String(name).trim();
    grade.basicSalary = basicSalary;
    grade.annualLeaveDays = annualLeaveDays;
    grade.holidayAllowance = holidayAllowance ?? 0;
    grade.notchPercentages = notchPercentages;
    if (isActive !== undefined) grade.isActive = isActive;

    await grade.save();
    res.json(grade);
  } catch (error) {
    console.error('Error updating grade:', error);
    res.status(500).json({ message: 'Error updating grade' });
  }
};

export const deleteGrade = async (req: AuthRequest, res: Response) => {
  try {
    const grade = await Grade.findById(req.params.id);
    if (!grade) {
      return res.status(404).json({ message: 'Grade not found' });
    }

    const staffOnGrade = await User.countDocuments({ grade: grade.name });
    if (staffOnGrade > 0) {
      return res.status(409).json({
        message: `Cannot delete grade "${grade.name}" — ${staffOnGrade} staff member(s) are still assigned to it`,
      });
    }

    await Grade.findByIdAndDelete(req.params.id);
    res.json({ message: 'Grade deleted successfully' });
  } catch (error) {
    console.error('Error deleting grade:', error);
    res.status(500).json({ message: 'Error deleting grade' });
  }
};

// HR checklist during migration: which User.grade string values have no matching Grade record yet
export const getUnmappedGradeNames = async (req: AuthRequest, res: Response) => {
  try {
    const userGradeNames = (await User.distinct('grade')).filter(Boolean);
    const gradeNames = new Set((await Grade.distinct('name')) as string[]);
    const unmapped = userGradeNames.filter((name: string) => !gradeNames.has(name));
    res.json({ unmapped: unmapped.sort() });
  } catch (error) {
    console.error('Error fetching unmapped grade names:', error);
    res.status(500).json({ message: 'Error fetching unmapped grade names' });
  }
};

export const getLeaveAllowanceRate = async (req: AuthRequest, res: Response) => {
  try {
    const ratePercent = await getLeaveAllowanceRatePercent();
    res.json({ ratePercent });
  } catch (error) {
    console.error('Error fetching leave allowance rate:', error);
    res.status(500).json({ message: 'Error fetching leave allowance rate' });
  }
};

export const updateLeaveAllowanceRate = async (req: AuthRequest, res: Response) => {
  try {
    const { ratePercent } = req.body;
    if (typeof ratePercent !== 'number' || ratePercent < 0) {
      return res.status(400).json({ message: 'ratePercent must be a non-negative number' });
    }

    await SystemSetting.findOneAndUpdate(
      { key: LEAVE_ALLOWANCE_RATE_KEY },
      { key: LEAVE_ALLOWANCE_RATE_KEY, value: String(ratePercent) },
      { upsert: true }
    );

    res.json({ ratePercent });
  } catch (error) {
    console.error('Error updating leave allowance rate:', error);
    res.status(500).json({ message: 'Error updating leave allowance rate' });
  }
};
