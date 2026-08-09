// Single source of truth for the role -> permission matrix.
//
// Both seedRoles() and the repair script import from here, so the matrix is never
// written twice. Every role below lists ALL of PERMISSION_KEYS explicitly rather than
// relying on the schema's `default: false` — an omitted key is indistinguishable from
// a deliberate `false` in the Settings > Roles & Permissions matrix, which is how the
// UI drifted out of sync with reality in the first place.

export const PERMISSION_KEYS = [
  'viewAppraisals',
  'createAppraisals',
  'reviewApprove',
  'manageTemplates',
  'manageUsers',
  'systemSettings',
  'committeeReview',
  'deleteAppraisals',
  'manageSalarySettings',
  'viewReports'
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type RolePermissions = Record<PermissionKey, boolean>;

export interface DefaultRole {
  name: string;
  slug: string;
  accessLevel: number;
  description: string;
  permissions: RolePermissions;
}

// Shorthand so each role reads as a complete matrix row instead of 10 lines of noise.
const perms = (granted: PermissionKey[]): RolePermissions =>
  PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = granted.includes(key);
    return acc;
  }, {} as RolePermissions);

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'CEO',
    slug: 'ceo',
    accessLevel: 12,
    description: 'Chief Executive Officer access',
    permissions: perms([
      'viewAppraisals',
      'createAppraisals',
      'reviewApprove',
      'manageTemplates',
      'manageUsers',
      'viewReports'
    ])
  },
  {
    name: 'Head of Corporate Services',
    slug: 'head_of_corporate_services',
    accessLevel: 11,
    description: 'Head of Corporate Services access',
    permissions: perms([
      'viewAppraisals',
      'createAppraisals',
      'reviewApprove',
      'manageTemplates',
      'manageUsers',
      'viewReports'
    ])
  },
  {
    name: 'Super Admin',
    slug: 'super_admin',
    accessLevel: 10,
    description: 'Full system access',
    permissions: perms([...PERMISSION_KEYS])
  },
  {
    name: 'COO',
    slug: 'coo',
    accessLevel: 9,
    description: 'Chief Operating Officer access',
    permissions: perms([
      'viewAppraisals',
      'createAppraisals',
      'reviewApprove',
      'manageTemplates',
      'manageUsers',
      'viewReports'
    ])
  },
  {
    name: 'Appraisal Committee',
    slug: 'appraisal_committee',
    accessLevel: 8,
    description: 'Appraisal committee member access',
    permissions: perms([
      'viewAppraisals',
      'createAppraisals',
      'reviewApprove',
      'manageTemplates',
      'committeeReview',
      'viewReports'
    ])
  },
  {
    name: 'HR Admin',
    slug: 'hr_admin',
    accessLevel: 7,
    description: 'HR management access',
    permissions: perms([
      'viewAppraisals',
      'createAppraisals',
      'reviewApprove',
      'manageTemplates',
      'manageUsers',
      'systemSettings',
      'deleteAppraisals',
      'manageSalarySettings',
      'viewReports'
    ])
  },
  {
    name: 'Division Head',
    slug: 'division_head',
    accessLevel: 6,
    description: 'Division level management',
    permissions: perms(['viewAppraisals', 'reviewApprove'])
  },
  {
    name: 'Department Head',
    slug: 'department_head',
    accessLevel: 5,
    description: 'Department level management',
    permissions: perms(['viewAppraisals', 'reviewApprove'])
  },
  {
    name: 'HR Officer',
    slug: 'hr_officer',
    accessLevel: 4,
    description: 'HR operational access',
    permissions: perms(['viewAppraisals', 'createAppraisals', 'reviewApprove'])
  },
  {
    name: 'Unit Head',
    slug: 'unit_head',
    accessLevel: 3,
    description: 'Unit level management',
    permissions: perms(['viewAppraisals', 'reviewApprove'])
  },
  {
    name: 'Supervisor',
    slug: 'supervisor',
    accessLevel: 2,
    description: 'Team supervision',
    permissions: perms(['viewAppraisals', 'reviewApprove'])
  },
  {
    name: 'Employee',
    slug: 'employee',
    accessLevel: 1,
    description: 'Standard employee access',
    permissions: perms(['viewAppraisals'])
  },
  {
    name: 'Guest',
    slug: 'guest',
    accessLevel: 0,
    description: 'Limited access',
    permissions: perms(['viewAppraisals'])
  }
];
