
import * as admin from 'firebase-admin';
import serviceAccount from '../../firebase-service-account.json';

let adminApp: admin.app | null = null;

try {
  if (admin.apps.length > 0) {
    adminApp = admin.app();
  } else {
    // Cast the imported JSON to the type Firebase expects.
    const serviceAccountInfo = serviceAccount as admin.ServiceAccount;

    // Check for placeholder values.
    if (serviceAccountInfo.project_id === 'your-project-id') {
      throw new Error(
        'Firebase service account is not configured. Please replace the placeholder in firebase-service-account.json with your actual credentials.'
      );
    }
    
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountInfo),
    });
  }
} catch (e: any) {
  // Catch parsing errors or initialization errors.
  console.error("CRITICAL: Firebase Admin initialization failed.", e.message);

  // Re-throw a more informative error for the API route to catch.
  let rawContent = '';
  try {
    rawContent = JSON.stringify(serviceAccount).substring(0, 100);
  } catch {
    rawContent = "Could not read or stringify the service account file."
  }
  
  throw new Error(`Firebase Admin initialization failed: ${e.message}. The service account file seems to be invalid. Start of file content: "${rawContent}..."`);
}

if (!adminApp) {
  throw new Error("Firebase Admin SDK is not available. The adminApp object is null.");
}

export const adminDb = adminApp.firestore();
export const adminAuth = adminApp.auth();
export const adminMessaging = adminApp.messaging();
export { admin };
