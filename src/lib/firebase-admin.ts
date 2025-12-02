
import * as admin from 'firebase-admin';
import 'dotenv/config';

let adminApp: admin.app | null = null;
let adminInitError: Error | null = null;

try {
  if (admin.apps.length > 0) {
    adminApp = admin.app();
  } else {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountString) {
      throw new Error('The FIREBASE_SERVICE_ACCOUNT environment variable is not set. Please check your .env file.');
    }
    
    const serviceAccount = JSON.parse(serviceAccountString);

    // Correctly format the private key
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (e: any) {
  let errorMessage = e.message;
  if (e instanceof SyntaxError) {
      errorMessage = `Failed to parse FIREBASE_SERVICE_ACCOUNT. Please ensure it's a valid JSON string in your .env file. Details: ${e.message}`;
  }
  
  console.error("CRITICAL: Firebase Admin initialization failed.", errorMessage);
  adminInitError = new Error(`Firebase Admin initialization failed: ${errorMessage}`);
}

if (!adminInitError && !adminApp) {
  adminInitError = new Error("Firebase Admin SDK is not available. The adminApp object is null for an unknown reason.");
}

const ensureAdminInitialized = () => {
    if (adminInitError) {
        throw adminInitError;
    }
    if (!adminApp) {
        throw new Error("Firebase Admin SDK could not be initialized.");
    }
    return adminApp;
}

export const adminDb = ensureAdminInitialized().firestore();
export const adminAuth = ensureAdminInitialized().auth();
export const adminMessaging = ensureAdminInitialized().messaging();

export { admin, adminInitError };
