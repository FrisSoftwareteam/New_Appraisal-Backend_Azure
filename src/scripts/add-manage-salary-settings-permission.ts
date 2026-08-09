import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role';

dotenv.config();

// SUPERSEDED by src/scripts/repair-role-permissions.ts (npm run migrate:role-permissions),
// which writes the full canonical matrix for every permission key at once. This script
// force-writes manageSalarySettings from its own hardcoded slug list and will undo part of
// that repair if run afterwards. Kept only for historical reference — do not run it.
//
// seedRoles() only creates roles that don't exist yet, so it never backfills a new
// permission key onto Role documents already in the database. This one-time script
// does that backfill for the new `manageSalarySettings` permission.
const SLUGS_WITH_ACCESS = ['super_admin', 'hr_admin'];

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const roles = await Role.find();
    for (const role of roles) {
      const shouldHaveAccess = SLUGS_WITH_ACCESS.includes(role.slug);
      (role.permissions as any).manageSalarySettings = shouldHaveAccess;
      await role.save();
      console.log(`Set manageSalarySettings=${shouldHaveAccess} for role "${role.slug}"`);
    }

    console.log('manageSalarySettings backfill completed');
    process.exit(0);
  } catch (error) {
    console.error('Error backfilling manageSalarySettings permission:', error);
    process.exit(1);
  }
};

run();
