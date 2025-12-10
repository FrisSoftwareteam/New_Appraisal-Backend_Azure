import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AppraisalTemplate from '../models/AppraisalTemplate';
import User from '../models/User';

dotenv.config();

const seedDemoTemplate = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a system admin to be the creator
    const admin = await User.findOne({ role: 'super_admin' });
    if (!admin) {
      console.error('No super_admin found to create template');
      process.exit(1);
    }

    const demoTemplate = {
      name: 'Global Demo Template',
      description: 'A general purpose template for demonstration and testing. Visible to all staff.',
      status: 'active',
      applicableDepartments: [], // Empty means all
      applicableGrades: [], // Empty means all
      createdBy: admin._id,
      questions: [
        {
          id: 'q1',
          text: 'How would you rate your overall performance this period?',
          type: 'rating',
          category: 'Performance',
          weight: 20,
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
          text: 'Rate your communication skills',
          type: 'rating',
          category: 'Skills',
          weight: 15,
          maxScore: 5,
          isRequired: true,
          isScored: true
        },
        {
          id: 'q4',
          text: 'Rate your teamwork and collaboration',
          type: 'rating',
          category: 'Skills',
          weight: 15,
          maxScore: 5,
          isRequired: true,
          isScored: true
        },
        {
          id: 'q5',
          text: 'Which of the following best describes your leadership style?',
          type: 'multiple_choice',
          category: 'Leadership',
          weight: 10,
          maxScore: 5,
          options: ['Directive', 'Supportive', 'Participative', 'Achievement-oriented'],
          isRequired: false,
          isScored: true
        }
      ]
    };

    // Check if it already exists to avoid duplicates
    const existing = await AppraisalTemplate.findOne({ name: demoTemplate.name });
    if (existing) {
      console.log('Demo template already exists. Updating...');
      await AppraisalTemplate.findByIdAndUpdate(existing._id, demoTemplate);
      console.log('Demo template updated successfully');
    } else {
      await AppraisalTemplate.create(demoTemplate);
      console.log('Demo template created successfully');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo template:', error);
    process.exit(1);
  }
};

seedDemoTemplate();
