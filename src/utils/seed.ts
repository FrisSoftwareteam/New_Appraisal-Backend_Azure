import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-appraisal';

const seed = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});

    const hashedPassword = await bcrypt.hash('password123', 8);

    const users = [
      {
        email: "admin@company.com",
        password: hashedPassword,
        firstName: "Sarah",
        lastName: "Johnson",
        role: "hr_admin",
        department: "Human Resources",
        division: "Operations",
        grade: "Senior",
        avatar: "/professional-woman-hr.jpg",
      },
      {
        email: "john.doe@company.com",
        password: hashedPassword,
        firstName: "John",
        lastName: "Doe",
        role: "employee",
        department: "Engineering",
        division: "Technology",
        grade: "Mid-Level",
        avatar: "/professional-engineer.png",
      },
      {
        email: "jane.smith@company.com",
        password: hashedPassword,
        firstName: "Jane",
        lastName: "Smith",
        role: "department_head",
        department: "Engineering",
        division: "Technology",
        grade: "Senior",
        avatar: "/professional-woman-manager.png",
      }
    ];

    await User.insertMany(users);
    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seed();
