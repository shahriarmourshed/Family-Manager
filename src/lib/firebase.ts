
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";


const firebaseConfig = {
  apiKey: "AIzaSyAOnRgf3OSlJ4F516dmtoylNZpVi1ofSLA",
  authDomain: "familyverse-5xnxn.firebaseapp.com",
  projectId: "familyverse-5xnxn",
  storageBucket: "familyverse-5xnxn.firebasestorage.app",
  messagingSenderId: "314321317316",
  appId: "1:314321317316:web:4077473d0083408bb68891",
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Initialize App Check
if (typeof window !== 'undefined') {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Ld-fA8qAAAAAPx_AmA2-5iE0P425s5aD9m_5C5P'), // Replace with your reCAPTCHA site key
    isTokenAutoRefreshEnabled: true
  });
}

// Initialize Firestore with offline persistence
let db;
try {
  db = initializeFirestore(app, {});
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firebase persistence failed. This can happen with multiple tabs open.');
    } else if (err.code === 'unimplemented') {
        console.warn('The current browser does not support all of the features required to enable persistence.');
    }
  });
} catch(e) {
  console.error("Error initializing Firestore with persistence", e);
  db = getFirestore(app); // Fallback to non-persistent Firestore
}


// Get a messaging instance
let messaging;
if (typeof window !== "undefined") {
    try {
        messaging = getMessaging(app);
    } catch (err) {
        console.error("Failed to initialize Firebase Messaging", err);
    }
}

export const requestForToken = async () => {
  if (!messaging || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const currentToken = await getToken(messaging, { 
          vapidKey: 'BBiqGgVOrDqA3mUjA_FmUnA-Fk-SSUi_yDkS-yGqH4t-6Lp3-zFpL5vX1f8mJ1hZ1g9wYjX2jV3k4eI',
          serviceWorkerRegistration 
      });
      if (currentToken) {
        console.log('FCM Token:', currentToken);
        return currentToken;
      } else {
        console.log('No registration token available. Request permission to generate one.');
        return null;
      }
    } else {
        console.log('Permission not granted for notifications');
        return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
      if (!messaging) return;
      onMessage(messaging, (payload) => {
        resolve(payload);
      });
});

export { app, auth, db, messaging };
