import { Response } from 'express';
import { Model } from 'mongoose';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';

type UserTaxonomyField = 'department' | 'division' | 'unit' | 'jobTitle';

interface TaxonomyDoc {
  _id: unknown;
  name: string;
  isActive: boolean;
}

export function createTaxonomyController(model: Model<any>, userField: UserTaxonomyField, label: string) {
  const getAll = async (req: AuthRequest, res: Response) => {
    try {
      const items = await model.find().sort({ name: 1 });
      res.json(items);
    } catch (error) {
      console.error(`Error fetching ${label} list:`, error);
      res.status(500).json({ message: `Error fetching ${label} list` });
    }
  };

  const getById = async (req: AuthRequest, res: Response) => {
    try {
      const item = await model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${label} not found` });
      }
      res.json(item);
    } catch (error) {
      console.error(`Error fetching ${label}:`, error);
      res.status(500).json({ message: `Error fetching ${label}` });
    }
  };

  const create = async (req: AuthRequest, res: Response) => {
    try {
      const { name, isActive } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: `${label} name is required` });
      }

      const trimmedName = name.trim();
      const existing = await model.findOne({ name: trimmedName });
      if (existing) {
        return res.status(409).json({ message: `A ${label.toLowerCase()} named "${trimmedName}" already exists` });
      }

      const item = await model.create({ name: trimmedName, isActive: isActive ?? true });
      res.status(201).json(item);
    } catch (error) {
      console.error(`Error creating ${label}:`, error);
      res.status(500).json({ message: `Error creating ${label}` });
    }
  };

  const update = async (req: AuthRequest, res: Response) => {
    try {
      const { name, isActive } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: `${label} name is required` });
      }

      const trimmedName = name.trim();
      const item: TaxonomyDoc | null = await model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${label} not found` });
      }

      if (trimmedName !== item.name) {
        const nameClash = await model.findOne({ name: trimmedName, _id: { $ne: item._id } });
        if (nameClash) {
          return res.status(409).json({ message: `A ${label.toLowerCase()} named "${trimmedName}" already exists` });
        }
      }

      (item as any).name = trimmedName;
      if (isActive !== undefined) (item as any).isActive = isActive;
      await (item as any).save();

      res.json(item);
    } catch (error) {
      console.error(`Error updating ${label}:`, error);
      res.status(500).json({ message: `Error updating ${label}` });
    }
  };

  const remove = async (req: AuthRequest, res: Response) => {
    try {
      const item: TaxonomyDoc | null = await model.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: `${label} not found` });
      }

      const staffOnEntry = await User.countDocuments({ [userField]: item.name });
      if (staffOnEntry > 0) {
        return res.status(409).json({
          message: `Cannot delete ${label.toLowerCase()} "${item.name}" — ${staffOnEntry} staff member(s) are still assigned to it`,
        });
      }

      await model.findByIdAndDelete(req.params.id);
      res.json({ message: `${label} deleted successfully` });
    } catch (error) {
      console.error(`Error deleting ${label}:`, error);
      res.status(500).json({ message: `Error deleting ${label}` });
    }
  };

  const getUnmapped = async (req: AuthRequest, res: Response) => {
    try {
      const userValues = (await User.distinct(userField)).filter(Boolean);
      const configuredNames = new Set((await model.distinct('name')) as string[]);
      const unmapped = userValues.filter((value: string) => !configuredNames.has(value));
      res.json({ unmapped: unmapped.sort() });
    } catch (error) {
      console.error(`Error fetching unmapped ${label} values:`, error);
      res.status(500).json({ message: `Error fetching unmapped ${label} values` });
    }
  };

  return { getAll, getById, create, update, remove, getUnmapped };
}
