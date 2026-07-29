import mongoose, { Model } from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Department from '../models/Department';
import Division from '../models/Division';
import Unit from '../models/Unit';
import JobRole from '../models/JobRole';

dotenv.config();

// Department/Division/Unit/JobRole start out empty. This one-time script backfills them
// from the free-text values already in use on existing User records, so the managed
// lists (and the Add Employee dropdowns that consume them) aren't empty on day one.
const TAXONOMIES: { model: Model<any>; userField: string; label: string }[] = [
  { model: Department, userField: 'department', label: 'Department' },
  { model: Division, userField: 'division', label: 'Division' },
  { model: Unit, userField: 'unit', label: 'Unit' },
  { model: JobRole, userField: 'jobTitle', label: 'Job Role' },
];

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const { model, userField, label } of TAXONOMIES) {
      const rawValues = (await User.distinct(userField)).filter(Boolean) as string[];
      let created = 0;
      let skipped = 0;

      for (const rawValue of rawValues) {
        const name = String(rawValue).trim();
        if (!name) continue;

        const existing = await model.findOne({ name });
        if (existing) {
          console.log(`  [${label}] already exists: "${name}"`);
          skipped += 1;
          continue;
        }

        await model.create({ name, isActive: true });
        console.log(`  [${label}] created: "${name}"`);
        created += 1;
      }

      console.log(`${label}: ${created} created, ${skipped} already existed`);
    }

    console.log('Org taxonomy seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding org taxonomy:', error);
    process.exit(1);
  }
};

run();
