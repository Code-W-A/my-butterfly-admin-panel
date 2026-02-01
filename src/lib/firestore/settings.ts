import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";

export type RecommendationSettings = {
  minMatchPercent: number;
};

const SETTINGS_COLLECTION = "app_settings";
const RECOMMENDATIONS_DOC = "recommendations";

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export async function getRecommendationSettings(): Promise<RecommendationSettings | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as RecommendationSettings;
  if (typeof data.minMatchPercent !== "number") return null;
  return { minMatchPercent: clampPercent(data.minMatchPercent) };
}

export async function updateRecommendationSettings(patch: RecommendationSettings) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  await setDoc(
    ref,
    {
      minMatchPercent: clampPercent(patch.minMatchPercent),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await touchMetaConfig();
}
