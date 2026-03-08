import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";

export async function touchMetaConfig(fieldKey = "updatedAt") {
  const { db } = initFirebase();
  if (!db) return;
  const ref = doc(db, "meta", "config");
  await setDoc(
    ref,
    {
      updatedAt: serverTimestamp(),
      ...(fieldKey !== "updatedAt" ? { [fieldKey]: serverTimestamp() } : {}),
    },
    { merge: true },
  );
}

export async function getMetaConfigUpdatedAtMs(fieldKey = "updatedAt"): Promise<number | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "meta", "config");
  const snapshot = await getDoc(ref);
  const updatedAt = snapshot.data()?.[fieldKey] ?? snapshot.data()?.updatedAt;
  if (!updatedAt || typeof updatedAt.toMillis !== "function") return null;
  return updatedAt.toMillis();
}

export function subscribeMetaConfigUpdates(onUpdate: (updatedAtMs: number | null) => void, fieldKey = "updatedAt") {
  const { db } = initFirebase();
  if (!db) {
    return () => {
      // noop
    };
  }
  const ref = doc(db, "meta", "config");
  return onSnapshot(
    ref,
    (snapshot) => {
      const updatedAt = snapshot.data()?.[fieldKey] ?? snapshot.data()?.updatedAt;
      if (!updatedAt || typeof updatedAt.toMillis !== "function") {
        onUpdate(null);
        return;
      }
      onUpdate(updatedAt.toMillis());
    },
    () => {
      // Ignore listener errors and keep last known local state.
    },
  );
}
