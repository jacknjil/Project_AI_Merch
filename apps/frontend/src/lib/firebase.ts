/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MESUREMENT_ID,
};

// 1. Check if we have a key and if we are in a browser/server environment
const canInitialize = !!firebaseConfig.apiKey;

// 2. Initialize the app safely
const app = !getApps().length
  ? canInitialize
    ? initializeApp(firebaseConfig)
    : null
  : getApp();

// 3. Export services with a fallback to prevent "null" crashes during build
// We cast as 'any' so the rest of the app doesn't complain about types during build
export const db = app ? getFirestore(app) : ({} as any);
export const storage = app ? getStorage(app) : ({} as any);
export const auth = app ? getAuth(app) : ({} as any);
