"use client";

import { FirebaseError } from "firebase/app";

export function getFirebaseErrorInfo(err: unknown): { code?: string; message: string } {
  if (err instanceof FirebaseError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: "Eroare necunoscută." };
}

export function logFirebaseError(context: string, err: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const info = getFirebaseErrorInfo(err);
  // eslint-disable-next-line no-console
  console.error(`[Firebase] ${context}`, info, err);
}
