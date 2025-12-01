import { Request, Response } from 'express';
import AppraisalPeriod from '../models/AppraisalPeriod';
import { AuthRequest } from '../middleware/auth.middleware';

export const createPeriod = async (req: AuthRequest, res: Response) => {
  try {
    const period = new AppraisalPeriod({
      ...req.body,
      createdBy: req.user?._id,
    });
    await period.save();
    res.status(201).send(period);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const getPeriods = async (req: Request, res: Response) => {
  try {
    const periods = await AppraisalPeriod.find({});
    res.send(periods);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const getPeriodById = async (req: Request, res: Response) => {
  try {
    const period = await AppraisalPeriod.findById(req.params.id);
    if (!period) {
      return res.status(404).send();
    }
    res.send(period);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const updatePeriod = async (req: Request, res: Response) => {
  try {
    const period = await AppraisalPeriod.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!period) {
      return res.status(404).send();
    }
    res.send(period);
  } catch (error) {
    res.status(400).send(error);
  }
};

export const deletePeriod = async (req: Request, res: Response) => {
  try {
    const period = await AppraisalPeriod.findByIdAndDelete(req.params.id);
    if (!period) {
      return res.status(404).send();
    }
    res.send(period);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Get assigned staff for a period
export const getAssignedStaff = async (req: Request, res: Response) => {
  try {
    const period = await AppraisalPeriod.findById(req.params.id).populate('assignedEmployees', 'firstName lastName email department role avatar');
    if (!period) {
      return res.status(404).json({ message: 'Period not found' });
    }
    res.json(period.assignedEmployees);
  } catch (error) {
    console.error('Error fetching assigned staff:', error);
    res.status(500).json({ message: 'Error fetching assigned staff', error });
  }
};

// Assign staff to a period (bulk)
export const assignStaff = async (req: Request, res: Response) => {
  try {
    const { employeeIds } = req.body;
    
    if (!Array.isArray(employeeIds)) {
      return res.status(400).json({ message: 'employeeIds must be an array' });
    }

    const period = await AppraisalPeriod.findById(req.params.id);
    if (!period) {
      return res.status(404).json({ message: 'Period not found' });
    }

    // Add new employees, avoiding duplicates
    const newEmployees = employeeIds.filter(id => !period.assignedEmployees.includes(id));
    period.assignedEmployees.push(...newEmployees);
    
    await period.save();
    await period.populate('assignedEmployees', 'firstName lastName email department role avatar');
    
    res.json(period.assignedEmployees);
  } catch (error) {
    console.error('Error assigning staff:', error);
    res.status(500).json({ message: 'Error assigning staff', error });
  }
};

// Remove staff from a period
export const removeStaff = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    
    const period = await AppraisalPeriod.findById(req.params.id);
    if (!period) {
      return res.status(404).json({ message: 'Period not found' });
    }

    period.assignedEmployees = period.assignedEmployees.filter(
      id => id.toString() !== employeeId
    );
    
    await period.save();
    await period.populate('assignedEmployees', 'firstName lastName email department role avatar');
    
    res.json(period.assignedEmployees);
  } catch (error) {
    console.error('Error removing staff:', error);
    res.status(500).json({ message: 'Error removing staff', error });
  }
};
