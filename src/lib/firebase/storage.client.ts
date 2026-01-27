"use client";

import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { initFirebase } from "@/lib/firebase/client";

const sanitizeFilename = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export async function uploadProductImage(file: File) {
  const { app } = initFirebase();
  if (!app) {
    throw new Error("Firebase nu este configurat.");
  }

  const storage = getStorage(app);
  const safeName = sanitizeFilename(file.name || "image");
  const objectId = generateId();
  const objectPath = `products/${objectId}-${safeName}`;
  const objectRef = ref(storage, objectPath);

  await uploadBytes(objectRef, file, {
    contentType: file.type || "image/jpeg",
  });

  return getDownloadURL(objectRef);
}

/**
 * Delete a product image from Firebase Storage by its download URL.
 * Extracts the storage path from the URL and deletes the object.
 */
export async function deleteProductImage(downloadUrl: string) {
  const { app } = initFirebase();
  if (!app) {
    throw new Error("Firebase nu este configurat.");
  }

  const storage = getStorage(app);

  // Extract path from Firebase Storage download URL
  // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?...
  const match = downloadUrl.match(/\/o\/(.+?)\?/);
  if (!match) {
    throw new Error("URL invalid pentru Firebase Storage.");
  }

  const encodedPath = match[1];
  const objectPath = decodeURIComponent(encodedPath);
  const objectRef = ref(storage, objectPath);

  await deleteObject(objectRef);
}
