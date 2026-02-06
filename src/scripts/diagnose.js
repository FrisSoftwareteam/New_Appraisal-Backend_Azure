const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('Connection Name:', mongoose.connection.name);

    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    
    for (const dbInfo of dbs.databases) {
      const db = mongoose.connection.client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      const usersColl = collections.find(c => c.name === 'users');
      if (usersColl) {
        const count = await db.collection('users').countDocuments();
        const withPromoted = await db.collection('users').countDocuments({ dateOfLastPromotion: { $exists: true } });
        console.log(`DB: ${dbInfo.name} | Users: ${count} | With dateOfLastPromotion: ${withPromoted}`);
      } else {
        console.log(`DB: ${dbInfo.name} | No users collection`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

diagnose();
