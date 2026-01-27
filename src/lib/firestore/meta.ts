import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";

export async function touchMetaConfig() {
  const { db } = initFirebase();
  if (!db) return;
  const ref = doc(db, "meta", "config");
  await setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true });
}
