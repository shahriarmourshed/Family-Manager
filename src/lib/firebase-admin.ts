import * as admin from 'firebase-admin';
import serviceAccount from '../../firebase-service-account.json';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  } catch (e) {
    console.error("Firebase Admin initialization error:", e);
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : null;
export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminMessaging = admin.apps.length ? admin.messaging() : null;
