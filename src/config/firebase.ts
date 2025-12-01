import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
// Expects FIREBASE_SERVICE_ACCOUNT to be a JSON string in environment variables
// OR specific fields if preferred. For simplicity, we'll check for the JSON string first.

let serviceAccount: any;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found in environment variables.');
  }
} catch (error) {
  console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT:', error);
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: serviceAccount ? admin.credential.cert(serviceAccount) : undefined,
      // If no credential provided, it might fall back to Application Default Credentials
      // which is useful for Google Cloud hosting.
    });
    console.log('✅ Firebase Admin Initialized');
  } catch (error) {
    console.error('❌ Firebase Admin Initialization Failed:', error);
  }
}

export const auth = admin.auth();
