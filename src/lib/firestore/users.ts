import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  startAfter,
  updateDoc,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import type { UserProfile, WithId } from "@/lib/firestore/types";

const USERS_COLLECTION = "users";

export async function listUsersPage(params: { pageSize?: number; cursor?: QueryDocumentSnapshot }) {
  const { db } = initFirebase();
  if (!db) return { items: [] as WithId<UserProfile>[], cursor: undefined };

  const pageSize = params.pageSize ?? 20;
  const usersCollection = collection(db, USERS_COLLECTION);
  const baseQuery = query(usersCollection, orderBy("updatedAt", "desc"));
  const q = params.cursor
    ? query(baseQuery, startAfter(params.cursor), limit(pageSize))
    : query(baseQuery, limit(pageSize));
  const snapshot = await getDocs(q);
  return {
    items: snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as UserProfile) })),
    cursor: snapshot.docs[snapshot.docs.length - 1],
  };
}

export async function getUserProfile(userId: string): Promise<WithId<UserProfile> | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as UserProfile) };
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<
    Pick<
      UserProfile,
      "firstName" | "lastName" | "displayName" | "email" | "phone" | "avatarUrl" | "language" | "equipment"
    >
  >,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, USERS_COLLECTION, userId);
  await updateDoc(ref, patch);
}
