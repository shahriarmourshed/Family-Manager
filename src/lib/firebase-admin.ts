
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

let adminApp: admin.app | null = null;
let adminInitError: Error | null = null;

try {
  if (admin.apps.length > 0) {
    adminApp = admin.app();
  } else {
    // Construct the path to the service account file
    const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
    
    // Check if the file exists before trying to read it
    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error('firebase-service-account.json not found. Please ensure the file exists at the root of your project.');
    }
    
    const serviceAccountString = fs.readFileSync(serviceAccountPath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountString) as admin.ServiceAccount;

    // Check for placeholder values.
    if (serviceAccount.project_id === 'your-project-id') {
      throw new Error(
        'Firebase service account is not configured. Please replace the placeholder in firebase-service-account.json with your actual credentials.'
      );
    }
    
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
} catch (e: any) {
  let errorMessage = e.message;
  if (e instanceof SyntaxError) {
      errorMessage = `Failed to parse firebase-service-account.json. Please ensure it is a valid JSON file. Details: ${e.message}`;
  }
  
  console.error("CRITICAL: Firebase Admin initialization failed.", errorMessage);
  adminInitError = new Error(`Firebase Admin initialization failed: ${errorMessage}`);
}

if (!adminInitError && !adminApp) {
  adminInitError = new Error("Firebase Admin SDK is not available. The adminApp object is null for an unknown reason.");
}


// Export a function that throws if the SDK is not initialized
const ensureAdminInitialized = () => {
    if (adminInitError) {
        throw adminInitError;
    }
    if (!adminApp) {
        throw new Error("Firebase Admin SDK could not be initialized.");
    }
    return adminApp;
}

// Lazy-loaded exports
export const adminDb = {
  get firestore() {
    return ensureAdminInitialized().firestore();
  }
}.firestore;

export const adminAuth = {
  get auth() {
    return ensureAdminInitialized().auth();
  }
}.auth;

export const adminMessaging = {
  get messaging() {
    return ensureAdminInitialized().messaging();
  }
}.messaging;

export { admin, adminInitError };
