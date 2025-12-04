import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Testing connection to:', MONGODB_URI?.split('@')[1]); // Log only the host part for security

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing in .env');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Connection failed:', err);
    process.exit(1);
  });
