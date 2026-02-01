import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { RecommendationRuleSet, WithId } from "@/lib/firestore/types";

const ruleSetsCollection = (db: NonNullable<ReturnType<typeof initFirebase>["db"]>) =>
  collection(db, "recommendation_rule_sets");

export async function listRuleSets(): Promise<WithId<RecommendationRuleSet>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const q = query(ruleSetsCollection(db), orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as RecommendationRuleSet),
  }));
}

export async function getRuleSet(ruleSetId: string): Promise<WithId<RecommendationRuleSet> | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "recommendation_rule_sets", ruleSetId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as RecommendationRuleSet) };
}

export async function createRuleSet(data: Omit<RecommendationRuleSet, "createdAt" | "updatedAt">) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = await addDoc(ruleSetsCollection(db), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return ref;
}

export async function updateRuleSet(
  ruleSetId: string,
  data: Partial<Omit<RecommendationRuleSet, "createdAt" | "updatedAt">>,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "recommendation_rule_sets", ruleSetId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
}

export async function deleteRuleSet(ruleSetId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "recommendation_rule_sets", ruleSetId);
  await deleteDoc(ref);
  await touchMetaConfig();
}
