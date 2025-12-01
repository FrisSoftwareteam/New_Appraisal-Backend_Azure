import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import AppraisalTemplate from '../models/AppraisalTemplate';
import AppraisalPeriod from '../models/AppraisalPeriod';
import AppraisalFlow from '../models/AppraisalFlow';
import Appraisal from '../models/Appraisal';

dotenv.config();

const assignDemoAppraisal = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Find Debug User
    const debugUserEmail = 'admin@company.com';
    const user = await User.findOne({ email: debugUserEmail });
    if (!user) {
      console.error(`Debug user ${debugUserEmail} not found`);
      process.exit(1);
    }
    console.log(`Found debug user: ${user.firstName} ${user.lastName}`);

    // 2. Find Demo Template
    const templateName = 'Global Demo Template';
    const template = await AppraisalTemplate.findOne({ name: templateName });
    if (!template) {
      console.error(`Template "${templateName}" not found. Run seed-demo-template.ts first.`);
      process.exit(1);
    }
    console.log(`Found template: ${template.name}`);

    // 3. Find Active Period
    let period = await AppraisalPeriod.findOne({ status: 'active' });
    if (!period) {
      console.log('No active period found, creating default...');
      period = await AppraisalPeriod.create({
        name: `Period ${new Date().getFullYear()}`,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        status: 'active',
        createdBy: user._id
      });
    }
    console.log(`Using period: ${period.name}`);

    // 4. Find Default Workflow
    let workflow = await AppraisalFlow.findOne({ isDefault: true });
    if (!workflow) {
      console.log('No default workflow found, creating default...');
      workflow = await AppraisalFlow.create({
        name: 'Standard Appraisal Flow',
        isDefault: true,
        createdBy: user._id,
        steps: [
          { name: 'Self Appraisal', rank: 1, assignedRole: 'employee', isRequired: true, dueInDays: 7 },
          { name: 'Manager Review', rank: 2, assignedRole: 'supervisor', isRequired: true, dueInDays: 7 }
        ]
      });
    }
    console.log(`Using workflow: ${workflow.name}`);

    // 5. Create Appraisal
    // Check if exists first
    const existing = await Appraisal.findOne({
      employee: user._id,
      template: template._id,
      period: period.name
    });

    if (existing) {
      console.log('Appraisal already exists for this user and template.');
      
      // Reset status if completed so they can test again
      if (existing.status === 'completed') {
          existing.status = 'in_progress'; // Valid status
          existing.currentStep = 0;
          await existing.save();
          console.log('Reset existing completed appraisal to active status.');
      }
    } else {
      // Resolve step assignments
      const stepAssignments = workflow.steps.map((step: any) => {
        let assignedUser = null;
        
        if (step.assignedRole === 'employee') {
          assignedUser = user._id;
        } else if (step.assignedRole === 'supervisor') {
          // For debug user (admin), they might not have a supervisor. 
          // Assign to themselves or leave null? 
          // Let's assign to themselves for testing flow if no supervisor.
          assignedUser = user.supervisor || user._id;
        }
        
        return {
          stepId: step._id || step.id,
          assignedUser: assignedUser,
          status: 'pending'
        };
      });

      await Appraisal.create({
        employee: user._id,
        template: template._id,
        workflow: workflow._id,
        period: period.name,
        status: 'in_progress', // Valid status
        currentStep: 0,
        stepAssignments,
        reviews: [],
        history: [{
          action: 'initiated',
          actor: user._id,
          timestamp: new Date(),
          comment: 'Auto-assigned via debug script'
        }]
      });
      console.log('Appraisal created successfully!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error assigning appraisal:', error);
    process.exit(1);
  }
};

assignDemoAppraisal();
