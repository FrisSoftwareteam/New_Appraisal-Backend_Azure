import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User';
import AppraisalPeriod from '../src/models/AppraisalPeriod';
import AppraisalFlow from '../src/models/AppraisalFlow';
import AppraisalTemplate from '../src/models/AppraisalTemplate';
import Appraisal from '../src/models/Appraisal';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-appraisal-system';

const seed = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Ensure Users Exist
    console.log('Checking users...');
    let employee = await User.findOne({ email: 'employee@company.com' });
    if (!employee) {
      employee = await User.create({
        email: 'employee@company.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'employee',
        department: 'Engineering',
        division: 'Technology',
        grade: 'Senior',
        accessLevel: 1,
        isFirstLogin: false
      });
      console.log('Created employee user');
    }

    let manager = await User.findOne({ email: 'admin@company.com' });
    if (!manager) {
      manager = await User.create({
        email: 'admin@company.com',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'super_admin',
        department: 'IT',
        division: 'Corporate',
        grade: 'Executive',
        accessLevel: 10,
        isFirstLogin: false
      });
      console.log('Created manager user');
    }

    // 2. Create Active Period
    console.log('Creating period...');
    const periodName = `Test Period ${new Date().getFullYear()} Q4`;
    let period = await AppraisalPeriod.findOne({ name: periodName });
    if (!period) {
      period = await AppraisalPeriod.create({
        name: periodName,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 3)),
        status: 'active',
        createdBy: manager._id
      });
      console.log('Created active period');
    }

    // 3. Create Workflow
    console.log('Creating workflow...');
    const workflowName = 'Standard Employee Workflow';
    let workflow = await AppraisalFlow.findOne({ name: workflowName });
    if (!workflow) {
      workflow = await AppraisalFlow.create({
        name: workflowName,
        description: 'Standard 2-step workflow',
        steps: [
          {
            name: 'Self Review',
            rank: 1,
            assignedRole: 'employee',
            isRequired: true,
            dueInDays: 3
          },
          {
            name: 'Manager Review',
            rank: 2,
            assignedRole: 'supervisor',
            isRequired: true,
            dueInDays: 5
          }
        ],
        status: 'active',
        createdBy: manager._id
      });
      console.log('Created workflow');
    }

    // 4. Create Template
    console.log('Creating template...');
    const templateName = 'Standard Performance Review';
    let template = await AppraisalTemplate.findOne({ name: templateName });
    if (!template) {
      template = await AppraisalTemplate.create({
        name: templateName,
        description: 'Standard performance review template',
        workflow: workflow._id,
        sections: [
          {
            id: 'goals',
            title: 'Goals & Objectives',
            description: 'Review your goals for this period',
            order: 0,
            questions: [
              {
                id: 'q1',
                text: 'What were your main achievements?',
                type: 'text',
                required: true,
                order: 0
              },
              {
                id: 'q2',
                text: 'Rate your performance',
                type: 'rating',
                required: true,
                order: 1,
                options: [
                  { label: '1 - Poor', value: 1 },
                  { label: '5 - Excellent', value: 5 }
                ]
              }
            ]
          }
        ],
        status: 'active',
        createdBy: manager._id
      });
      console.log('Created template');
    }

    // 5. Create Appraisal
    console.log('Creating appraisal...');
    let appraisal = await Appraisal.findOne({
      employee: employee._id,
      period: period.name,
      template: template._id
    });

    if (!appraisal) {
      appraisal = await Appraisal.create({
        employee: employee._id,
        template: template._id,
        workflow: workflow._id,
        period: period.name,
        status: 'in_progress',
        currentStep: 0,
        stepAssignments: [
            {
                stepId: (workflow.steps[0] as any)._id?.toString() || 'step_1',
                assignedUser: employee._id,
                status: 'pending'
            },
            {
                stepId: (workflow.steps[1] as any)._id?.toString() || 'step_2',
                assignedUser: manager._id,
                status: 'pending'
            }
        ],
        history: [
          {
            action: 'created',
            actor: manager._id,
            timestamp: new Date(),
            comment: 'Auto-generated by seed script'
          }
        ]
      });
      console.log('Created appraisal');
    } else {
        console.log('Appraisal already exists');
    }

    console.log('Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seed();
