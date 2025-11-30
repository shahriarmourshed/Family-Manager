
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeAppCheck, ReCaptchaV3Provider } from "@firebase/app-check";


const firebaseConfig = {
  apiKey: "AIzaSyAOnRgf3OSlJ4F516dmtoylNZpVi1ofSLA",
  authDomain: "familyverse-5xnxn.firebaseapp.com",
  databaseURL: "https://familyverse-5xnxn-default-rtdb.firebaseio.com",
  projectId: "familyverse-5xnxn",
  storageBucket: "familyverse-5xnxn.firebasestorage.app",
  messagingSenderId: "314321317316",
  appId: "1:314321317316:web:abb25ed31233fb4cb68891"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);


// Initialize Firestore with offline persistence
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({})
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
