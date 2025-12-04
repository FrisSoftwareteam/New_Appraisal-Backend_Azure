const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

console.log('Testing connection to:', uri.replace(/:([^:@]+)@/, ':****@'));

mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('Successfully connected to MongoDB!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed:', err);
    if (err.reason) {
        console.error('Reason:', JSON.stringify(err.reason, null, 2));
    }
    process.exit(1);
  });
