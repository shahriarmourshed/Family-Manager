
import * as admin from 'firebase-admin';
import serviceAccount from '../../firebase-service-account.json';

let adminApp: admin.app | null = null;
let adminInitializationError: Error | null = null;

if (!admin.apps.length) {
  try {
    // Check if the service account has been filled out.
    if (serviceAccount.project_id === 'your-project-id') {
      throw new Error(
        'Firebase service account is not configured. Please replace the placeholder in firebase-service-account.json with your actual credentials.'
      );
    }
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  } catch (e: any) {
    console.error("Firebase Admin initialization error:", e);
    adminInitializationError = e;
  }
} else {
  adminApp = admin.apps[0];
}

function getAdminSDK() {
  if (adminInitializationError) {
    throw adminInitializationError;
  }
  if (!adminApp) {
    throw new Error("Firebase Admin SDK is not initialized.");
  }
  return adminApp;
}

export const adminDb = adminApp ? getAdminSDK().firestore() : null;
export const adminAuth = adminApp ? getAdminSDK().auth() : null;
export const adminMessaging = adminApp ? getAdminSDK().messaging() : null;
export { admin };
