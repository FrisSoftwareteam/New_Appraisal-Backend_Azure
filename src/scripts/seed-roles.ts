import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedRoles } from '../controllers/role.controller';

dotenv.config();

const runSeed = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    await seedRoles();
    
    console.log('Seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding roles:', error);
    process.exit(1);
  }
};

runSeed();
