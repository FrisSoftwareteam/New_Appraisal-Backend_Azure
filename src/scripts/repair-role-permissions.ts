import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role';
import { DEFAULT_ROLES, PERMISSION_KEYS } from '../constants/role-permissions';

dotenv.config();

// seedRoles() only creates roles that don't already exist, so it can never correct or
// backfill permissions on a database that has been seeded before. This script writes the
// canonical matrix from src/constants/role-permissions.ts onto every role, creating any
// that are missing.
//
// Preview without writing:  npm run migrate:role-permissions -- --dry-run
// Apply:                    npm run migrate:role-permissions
//
// This overwrites permissions on every role, so it discards any customisation made
// through the Settings > Roles & Permissions matrix. Preview first.
//
// This SUPERSEDES `npm run migrate:salary-permission`. That older script force-writes
// manageSalarySettings from its own hardcoded slug list and would undo part of this
// repair if run afterwards — don't.

const dryRun = process.argv.includes('--dry-run');

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log(`Connected to MongoDB${dryRun ? '  [DRY RUN — no writes]' : ''}`);

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const roleData of DEFAULT_ROLES) {
      // .lean() gives the raw stored document with no schema defaults applied, so a key
      // that is physically absent is distinguishable from one stored as false. Reading
      // through the model would fill in `default: false` and hide the difference.
      const stored = (await Role.findOne({ slug: roleData.slug }).lean()) as
        | { permissions?: Record<string, boolean | undefined> }
        | null;

      if (!stored) {
        if (!dryRun) await Role.create(roleData);
        created++;
        console.log(`create   ${roleData.slug}`);
        continue;
      }

      const current = stored.permissions || {};
      const changes = PERMISSION_KEYS.filter(
        (key) => Boolean(current[key]) !== roleData.permissions[key]
      );
      const absent = PERMISSION_KEYS.filter((key) => typeof current[key] !== 'boolean');

      if (changes.length === 0 && absent.length === 0) {
        unchanged++;
        console.log(`ok       ${roleData.slug}`);
        continue;
      }

      if (!dryRun) {
        // updateOne with an explicit $set writes every key unconditionally. Loading the
        // doc and calling .set() would skip no-op assignments, leaving keys that only
        // exist as schema defaults unmaterialised in the database.
        await Role.updateOne(
          { slug: roleData.slug },
          {
            $set: {
              name: roleData.name,
              description: roleData.description,
              accessLevel: roleData.accessLevel,
              permissions: roleData.permissions
            }
          }
        );
      }
      updated++;

      const parts = changes.map(
        (key) => `${key}: ${Boolean(current[key])} -> ${roleData.permissions[key]}`
      );
      if (absent.length) parts.push(`materialised ${absent.join(', ')}`);
      console.log(`repair   ${roleData.slug} (${parts.join(', ')})`);
    }

    console.log(
      `\n${dryRun ? 'Would apply' : 'Applied'}: ${created} created, ${updated} repaired, ${unchanged} already correct`
    );
    if (dryRun) console.log('Dry run — nothing was written. Re-run without --dry-run to apply.');
    process.exit(0);
  } catch (error) {
    console.error('Error repairing role permissions:', error);
    process.exit(1);
  }
};

run();
