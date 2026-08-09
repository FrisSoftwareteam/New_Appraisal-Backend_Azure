import { Request, Response } from 'express';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/auth.middleware';
import { DEFAULT_ROLES, PERMISSION_KEYS } from '../constants/role-permissions';

// Get all roles
export const getRoles = async (req: Request, res: Response) => {
  try {
    const roles = await Role.find().sort({ accessLevel: -1 });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching roles', error });
  }
};

// Update a role
export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ message: 'A permissions object is required' });
    }

    // Only accept known permission keys, and set them field-by-field so a partial
    // payload can't wipe the keys it omitted.
    const update: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) {
      if (key in permissions) {
        update[`permissions.${key}`] = Boolean(permissions[key]);
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No recognised permission keys provided' });
    }

    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Error updating role', error });
  }
};

// Seed default roles (Internal use)
export const seedRoles = async () => {
  for (const roleData of DEFAULT_ROLES) {
    // Only create if it doesn't exist to prevent overwriting custom permissions.
    // To repair or backfill roles that already exist, run:
    //   npm run migrate:role-permissions
    const existing = await Role.findOne({ slug: roleData.slug });
    if (!existing) {
      await Role.create(roleData);
    }
  }
  console.log('Roles seeded successfully');
};
