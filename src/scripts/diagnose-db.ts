import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';

async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('Connection URI:', MONGODB_URI.replace(/:([^:@]+)@/, ':****@')); // Hide password
    console.log('Database Name:', mongoose.connection.name);

    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log('Available Databases:');
    dbs.databases.forEach(db => console.log(`- ${db.name}`));

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Collections in "${mongoose.connection.name}":`);
    collections.forEach(c => console.log(`- ${c.name}`));

    // Check count of users in this DB
    const count = await mongoose.connection.db.collection('users').countDocuments();
    console.log(`Total users in "users" collection: ${count}`);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

diagnose();
