
import * as admin from 'firebase-admin';
require('dotenv').config();

const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountString) {
  console.warn("FIREBASE_SERVICE_ACCOUNT is not set. Firebase Admin SDK will not be initialized.");
}

if (!admin.apps.length) {
    if (serviceAccountString) {
        try {
            const serviceAccount = JSON.parse(serviceAccountString);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT. Make sure it's a valid JSON string.", e);
        }
    }
}

export const adminDb = admin.apps.length ? admin.firestore() : null;
export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminMessaging = admin.apps.length ? admin.messaging() : null;
