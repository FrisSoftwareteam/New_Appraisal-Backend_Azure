const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/colindecorce/Desktop/ProjectsPersonal/AppraisalWork/New_Appraisal-Backend_Azure/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';

async function checkUsers() {
  await mongoose.connect(MONGODB_URI);
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    firstName: String,
    lastName: String,
    role: String,
    department: String,
  }));

  const users = await User.find({}).limit(10);
  console.log('--- Users in Database ---');
  users.forEach(u => {
    console.log(`${u.firstName} ${u.lastName} (${u.role}) - Email: ${u.email}`);
  });
  
  await mongoose.disconnect();
}

checkUsers().catch(console.error);
