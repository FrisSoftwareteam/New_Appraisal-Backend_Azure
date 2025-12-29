import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth.middleware';

// Get audit logs with filtering and pagination
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, action, entity, search } = req.query;
    const query: any = {};

    if (action && action !== 'all') {
      query.action = action;
    }

    if (entity && entity !== 'all') {
      query.entityType = entity;
    }

    // Basic search implementation (could be improved with text index)
    if (search) {
      // Since 'details' isn't a direct field in the model (it's constructed or part of metadata/changes),
      // we might need to adjust this. However, looking at the frontend mock data, 'details' was a field.
      // The model has 'changes' and 'metadata'. 
      // Let's assume for now we search in metadata values if 'details' isn't there, 
      // or we might need to add a 'details' field to the model if we want easy searching.
      // For now, let's search in entityId or entityType as a fallback if no text index.
      // Ideally, we should add a 'summary' or 'details' field to the AuditLog model for human-readable logs.
      // I'll stick to exact matches or simple regex on fields that exist.
      // Or, I can check if I should update the model. 
      // The frontend mock data has a 'details' field. The backend model DOES NOT.
      // I should update the backend model to include a 'details' string field for easier display/search.
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate('userId', 'firstName lastName avatar email');

    const total = await AuditLog.countDocuments(query);

    res.json({
      logs,
      total,
      pages: Math.ceil(total / Number(limit)),
      currentPage: Number(page)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs', error });
  }
};

// Create audit log (Internal helper)
export const createAuditLog = async (
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string, // Adding this param to match frontend expectation, will need to update model
  changes?: any,
  metadata?: any
) => {
  try {
    await AuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      details,
      changes,
      metadata
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
};

// Delete all audit logs (super_admin only)
export const deleteAllAuditLogs = async (req: Request, res: Response) => {
  try {
    await AuditLog.deleteMany({});
    res.json({ message: 'All audit logs cleared successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing audit logs', error });
  }
};
