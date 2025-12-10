import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Appraisal from '../src/models/Appraisal';
import AppraisalFlow from '../src/models/AppraisalFlow';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-appraisal-system';

const debug = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // First, get the appraisal without populate
    const appraisal = await Appraisal.findOne({ period: 'Test Period 2025 Q4' });
    
    if (appraisal) {
      console.log('Appraisal found:');
      console.log('  Current Step:', appraisal.currentStep);
      console.log('  Workflow ID:', appraisal.workflow);
      
      console.log('\nStep Assignments:');
      appraisal.stepAssignments.forEach((assignment, index) => {
        console.log(`\n  Assignment ${index}:`);
        console.log('    stepId:', assignment.stepId);
        console.log('    assignedUser:', assignment.assignedUser);
        console.log('    status:', assignment.status);
      });
      
      // Now get the workflow separately
      const workflow = await AppraisalFlow.findById(appraisal.workflow);
      if (workflow) {
        console.log('\n\nWorkflow:');
        console.log('  Name:', workflow.name);
        console.log('\nSteps:');
        workflow.steps.forEach((step: any, index: number) => {
          console.log(`\n  Step ${index}:`);
          console.log('    _id:', step._id);
          console.log('    id:', step.id);
          console.log('    name:', step.name);
          console.log('    rank:', step.rank);
        });
        
        console.log('\n\nCurrent step from workflow:');
        const currentStep = workflow.steps[appraisal.currentStep];
        if (currentStep) {
          console.log('  _id:', (currentStep as any)._id);
          console.log('  id:', (currentStep as any).id);
          console.log('  name:', (currentStep as any).name);
        }
      }
    } else {
      console.log('No appraisal found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  }
};

debug();
