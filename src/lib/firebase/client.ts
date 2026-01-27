"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
  );
}

export function initFirebase() {
  // During SSR/prerender there is no window; avoid initializing Firebase.
  if (typeof window === "undefined") {
    return { app, auth, db };
  }

  if (app && auth && db) {
    return { app, auth, db };
  }

  if (!isFirebaseConfigured()) {
    return { app, auth, db };
  }

  app = getApps()[0] ?? initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  return { app, auth, db };
}

export { app, auth, db };
