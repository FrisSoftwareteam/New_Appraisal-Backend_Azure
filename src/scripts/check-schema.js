const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({});
    if (user) {
      console.log('First user keys:', Object.keys(user));
      console.log('First user data:', JSON.stringify(user, null, 2));
    } else {
      console.log('No users found in collection "users"');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

diagnose();
