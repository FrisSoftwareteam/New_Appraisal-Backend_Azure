
import mongoose from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
import User from '../src/models/User';
import AppraisalTemplate from '../src/models/AppraisalTemplate';
import AppraisalFlow from '../src/models/AppraisalFlow';
import Appraisal from '../src/models/Appraisal';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const seedAppraisal = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // 1. Find a user to be the employee
    const employee = await User.findOne({ role: 'employee' });
    if (!employee) {
      console.error('No employee found. Please create a user with role "employee" first.');
      process.exit(1);
    }
    console.log(`Found employee: ${employee.firstName} ${employee.lastName} (${employee.email})`);

    // 2. Find a user to be the manager (or use the same user for testing if no manager)
    let manager = await User.findOne({ role: { $in: ['supervisor', 'manager', 'hr_admin'] } });
    if (!manager) {
        console.log('No manager found, using employee as manager for testing purposes.');
        manager = employee;
    }
    console.log(`Found manager: ${manager!.firstName} ${manager!.lastName}`);

    // 3. Create a Template
    const template = await AppraisalTemplate.create({
      name: 'Standard Performance Review 2025',
      description: 'Annual performance review template',
      questions: [
        {
          id: 'q1',
          text: 'How would you rate your overall performance this year?',
          type: 'rating',
          category: 'Performance',
          weight: 50,
          maxScore: 5,
          isRequired: true,
          isScored: true
        },
        {
          id: 'q2',
          text: 'What were your key achievements?',
          type: 'text',
          category: 'Achievements',
          weight: 0,
          maxScore: 0,
          isRequired: true,
          isScored: false
        },
        {
            id: 'q3',
            text: 'Rate your teamwork skills',
            type: 'rating',
            category: 'Soft Skills',
            weight: 50,
            maxScore: 5,
            isRequired: true,
            isScored: true
        }
      ],
      applicableGrades: [],
      applicableDepartments: [],
      status: 'active',
      createdBy: manager!._id
    });
    console.log(`Created Template: ${template.name}`);

    // 4. Create a Workflow
    const workflow = await AppraisalFlow.create({
      name: 'Standard 2-Step Flow',
      description: 'Self Review -> Manager Review',
      steps: [
        {
          name: 'Self Review',
          rank: 1,
          assignedRole: 'employee',
          isRequired: true,
          dueInDays: 7
        },
        {
          name: 'Manager Review',
          rank: 2,
          assignedRole: 'supervisor',
          isRequired: true,
          dueInDays: 14
        }
      ],
      isDefault: true,
      createdBy: manager!._id
    });
    console.log(`Created Workflow: ${workflow.name}`);

    // 5. Initiate Appraisal
    // We need to manually construct the step assignments since we are not using the controller logic here
    const steps: any[] = workflow.steps;
    const stepAssignments = [
        {
            stepId: steps[0]._id || steps[0].id, // Self Review
            assignedUser: employee._id,
            status: 'pending'
        },
        {
            stepId: steps[1]._id || steps[1].id, // Manager Review
            assignedUser: manager!._id,
            status: 'pending'
        }
    ];

    const appraisal = await Appraisal.create({
      employee: employee._id,
      template: template._id,
      workflow: workflow._id,
      period: '2025-Q1',
      status: 'in_progress', // Start in progress
      currentStep: 0, // 0 index = Self Review
      stepAssignments,
      reviews: [],
      history: [{
        action: 'initiated',
        actor: manager!._id,
        comment: 'Seeded via script'
      }]
    });

    console.log(`Initiated Appraisal for ${employee.email}`);
    console.log(`Appraisal ID: ${appraisal._id}`);
    console.log('Done!');
    process.exit(0);

  } catch (error) {
    console.error('Error seeding appraisal:', error);
    process.exit(1);
  }
};

seedAppraisal();
