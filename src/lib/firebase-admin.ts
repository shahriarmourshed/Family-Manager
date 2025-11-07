
import * as admin from 'firebase-admin';
import serviceAccount from '../../firebase-service-account.json';

let adminApp: admin.app;

try {
  if (admin.apps.length > 0) {
    adminApp = admin.app();
  } else {
    // Check if the service account has been filled out.
    if (serviceAccount.project_id === 'your-project-id') {
      throw new Error(
        'Firebase service account is not configured. Please replace the placeholder in firebase-service-account.json with your actual credentials.'
      );
    }
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  }
} catch (e: any) {
  // Re-throwing the error is crucial so that the API route can catch it and report it.
  console.error("CRITICAL: Firebase Admin initialization failed.", e.message);
  throw new Error(`Firebase Admin initialization failed: ${e.message}`);
}

export const adminDb = adminApp.firestore();
export const adminAuth = adminApp.auth();
export const adminMessaging = adminApp.messaging();
export { admin };
