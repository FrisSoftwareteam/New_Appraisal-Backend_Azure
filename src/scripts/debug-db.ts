import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';

async function checkUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const users = await User.find({ dateOfLastPromotion: { $exists: true } })
      .select('email firstName lastName dateOfLastPromotion updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10);

    console.log(`Found ${users.length} users with dateOfLastPromotion:`);
    users.forEach(u => {
      console.log(`- ${u.email}: ${u.dateOfLastPromotion} (Updated at: ${u.updatedAt})`);
    });

    const anyPromoted = await User.findOne({ dateOfLastPromotion: { $exists: true } });
    if (!anyPromoted) {
      console.log('NO USERS FOUND with dateOfLastPromotion field.');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();
