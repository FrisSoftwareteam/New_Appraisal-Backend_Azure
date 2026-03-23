const nodemailer = require('nodemailer');
require('dotenv').config({ path: '/Users/colindecorce/Desktop/ProjectsPersonal/AppraisalWork/New_Appraisal-Backend_Azure/.env' });

console.log('Testing email connection on port 587 (TLS)...');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify(function (error, success) {
  if (error) {
    console.error('Verification failed on 587:', error);
    process.exit(1);
  } else {
    console.log('Server is ready to take our messages on port 587');
    process.exit(0);
  }
});
