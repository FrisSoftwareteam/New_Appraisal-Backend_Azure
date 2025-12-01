import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User';
import Appraisal from '../src/models/Appraisal';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-appraisal-system';

const debug = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find employee
    const employee = await User.findOne({ email: 'employee@company.com' });
    console.log('Employee found:', employee ? {
      _id: employee._id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      role: employee.role
    } : 'NOT FOUND');
    console.log('\n---\n');

    // Find all appraisals
    const allAppraisals = await Appraisal.find();
    console.log(`Total appraisals in DB: ${allAppraisals.length}`);
    
    if (allAppraisals.length > 0) {
      console.log('\nAppraisals:');
      allAppraisals.forEach((appraisal, index) => {
        console.log(`\nAppraisal ${index + 1}:`);
        console.log('  _id:', appraisal._id);
        console.log('  employee:', appraisal.employee);
        console.log('  template:', appraisal.template);
        console.log('  workflow:', appraisal.workflow);
        console.log('  period:', appraisal.period);
        console.log('  status:', appraisal.status);
        console.log('  currentStep:', appraisal.currentStep);
        console.log('  stepAssignments:', appraisal.stepAssignments);
      });
    }
    console.log('\n---\n');

    // Try to find appraisals for employee
    if (employee) {
      const employeeAppraisals = await Appraisal.find({ employee: employee._id });
      console.log(`Appraisals for employee ${employee.email}: ${employeeAppraisals.length}`);
      
      if (employeeAppraisals.length > 0) {
        console.log('Employee appraisals found!');
      } else {
        console.log('No appraisals found for this employee ID');
        
        // Check if employee ID matches any appraisal
        const mismatch = allAppraisals.find(a => a.employee.toString() !== employee._id.toString());
        if (mismatch) {
          console.log('Found ID mismatch!');
          console.log('  Appraisal employee ID:', mismatch.employee);
          console.log('  User _id:', employee._id);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
};

debug();
