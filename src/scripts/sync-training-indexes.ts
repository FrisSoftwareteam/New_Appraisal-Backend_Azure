import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TrainingAssignment from '../models/TrainingAssignment';
import TrainingComment from '../models/TrainingComment';
import TrainingTest from '../models/TrainingTest';
import TrainingTestAttempt from '../models/TrainingTestAttempt';

dotenv.config();

// server.ts connects with autoIndex: false, so indexes declared on a schema are never
// built automatically. Run this once after deploying the Training v2 models, otherwise
// the reviewer queue and attempt-history lookups fall back to collection scans.
//
//   npm run migrate:training-indexes

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const models = [TrainingAssignment, TrainingComment, TrainingTest, TrainingTestAttempt];

    for (const model of models) {
      const dropped = await model.syncIndexes();
      console.log(
        `${model.modelName}: indexes synced${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`
      );
    }

    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to sync training indexes:', error);
    process.exit(1);
  }
};

run();
