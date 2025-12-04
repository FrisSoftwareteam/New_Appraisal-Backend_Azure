import { Request, Response } from 'express';
import Role from '../models/Role';
import { AuthRequest } from '../middleware/auth.middleware';

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
    
    // Prevent updating critical roles if needed, but for now allow all
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { permissions },
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
  const defaultRoles = [
    {
      name: "Super Admin",
      slug: "super_admin",
      accessLevel: 10,
      description: "Full system access",
      permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: true }
    },
    {
      name: "COO",
      slug: "coo",
      accessLevel: 9,
      description: "Chief Operating Officer access",
      permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: false }
    },
    {
      name: "Appraisal Committee",
      slug: "appraisal_committee",
      accessLevel: 8,
      description: "Appraisal committee member access",
      permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: false, systemSettings: false }
    },
    {
      name: "HR Admin",
      slug: "hr_admin",
      accessLevel: 7,
      description: "HR management access",
      permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: true, manageUsers: true, systemSettings: false }
    },
    {
      name: "Division Head",
      slug: "division_head",
      accessLevel: 6,
      description: "Division level management",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "Department Head",
      slug: "department_head",
      accessLevel: 5,
      description: "Department level management",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "HR Officer",
      slug: "hr_officer",
      accessLevel: 4,
      description: "HR operational access",
      permissions: { viewAppraisals: true, createAppraisals: true, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "Unit Head",
      slug: "unit_head",
      accessLevel: 3,
      description: "Unit level management",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "Supervisor",
      slug: "supervisor",
      accessLevel: 2,
      description: "Team supervision",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: true, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "Employee",
      slug: "employee",
      accessLevel: 1,
      description: "Standard employee access",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: false, manageTemplates: false, manageUsers: false, systemSettings: false }
    },
    {
      name: "Guest",
      slug: "guest",
      accessLevel: 0,
      description: "Limited access",
      permissions: { viewAppraisals: true, createAppraisals: false, reviewApprove: false, manageTemplates: false, manageUsers: false, systemSettings: false }
    }
  ];

  for (const roleData of defaultRoles) {
    await Role.findOneAndUpdate(
      { slug: roleData.slug },
      roleData,
      { upsert: true, new: true }
    );
  }
  console.log('Roles seeded successfully');
};
