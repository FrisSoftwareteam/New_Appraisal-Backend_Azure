import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth.middleware';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Maps frontend filter values to backend action values (exact or prefix) */
const ACTION_FILTER_MAP: Record<string, string[]> = {
  create: ['create'],
  update: ['update', 'admin_edit', 'appraisal_admin_edit'],
  delete: ['delete'],
  submit: ['submit', 'submit_review'],
  approve: ['approve'],
  reject: ['reject', 'appraisal_rejected'],
  comment: ['comment'],
  reassign: ['reassign'],
  committee_review: ['committee_review'],
  appraisal_completed: ['appraisal_completed', 'appraisal_accepted_intermediate'],
};

// Get audit logs with filtering and pagination
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, action, entity, search } = req.query;
    const query: Record<string, unknown> = {};

    if (action && String(action) !== 'all') {
      const actionStr = String(action).trim();
      const mappedActions = ACTION_FILTER_MAP[actionStr] ?? [actionStr];
      query.action = mappedActions.length === 1 ? mappedActions[0] : { $in: mappedActions };
    }

    if (entity && String(entity) !== 'all') {
      query.entityType = String(entity).trim();
    }

    const searchStr = typeof search === 'string' ? search.trim() : '';
    if (searchStr) {
      const searchRegex = new RegExp(escapeRegex(searchStr), 'i');
      query.$or = [
        { details: searchRegex },
        { entityId: searchRegex },
        { entityType: searchRegex },
      ];
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
