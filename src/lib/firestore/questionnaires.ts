import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { cache } from "@/lib/firestore/cache";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { Questionnaire, WithId } from "@/lib/firestore/types";

export async function listQuestionnaires(): Promise<WithId<Questionnaire>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const questionnairesCollection = collection(db, "questionnaires");
  const q = query(questionnairesCollection, orderBy("updatedAt", "desc"), limit(50));
  const snapshot = await getDocs(q);
  const items = snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Questionnaire),
    }))
    .filter((item) => item.id !== "vocabulary");
  cache.questionnaires.setMany(items);
  return items;
}

export async function listQuestionnairesPage(params: { pageSize?: number; cursor?: QueryDocumentSnapshot }) {
  const { db } = initFirebase();
  if (!db) return { items: [] as WithId<Questionnaire>[], cursor: undefined };
  const questionnairesCollection = collection(db, "questionnaires");
  const pageSize = params.pageSize ?? 20;
  const q = params.cursor
    ? query(questionnairesCollection, orderBy("updatedAt", "desc"), startAfter(params.cursor), limit(pageSize))
    : query(questionnairesCollection, orderBy("updatedAt", "desc"), limit(pageSize));
  const snapshot = await getDocs(q);
  const items = snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Questionnaire),
    }))
    .filter((item) => item.id !== "vocabulary");
  cache.questionnaires.setMany(items);
  const nextCursor = snapshot.docs[snapshot.docs.length - 1];
  return { items, cursor: nextCursor };
}

export async function getQuestionnaire(questionnaireId: string): Promise<WithId<Questionnaire> | null> {
  const cached = cache.questionnaires.get(questionnaireId);
  if (cached) return cached;
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "questionnaires", questionnaireId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const item = { id: snapshot.id, ...(snapshot.data() as Questionnaire) };
  cache.questionnaires.set(item);
  return item;
}

export async function createQuestionnaire(data: Pick<Questionnaire, "title" | "active" | "linkedRuleSetId">) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const questionnairesCollection = collection(db, "questionnaires");
  const ref = await addDoc(questionnairesCollection, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return ref;
}

export async function updateQuestionnaire(
  questionnaireId: string,
  data: Partial<Pick<Questionnaire, "title" | "active">>,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "questionnaires", questionnaireId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  const cached = cache.questionnaires.get(questionnaireId);
  if (cached) {
    cache.questionnaires.set({
      ...cached,
      ...data,
    } as WithId<Questionnaire>);
  }
  await touchMetaConfig();
}

export async function toggleQuestionnaireActive(questionnaireId: string, active: boolean) {
  return updateQuestionnaire(questionnaireId, { active });
}

export async function batchSetQuestionnairesActive(ids: string[], active: boolean) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const batch = writeBatch(db);
  ids.forEach((id) => {
    const ref = doc(db, "questionnaires", id);
    batch.update(ref, { active, updatedAt: serverTimestamp() });
  });
  await batch.commit();
  ids.forEach((id) => {
    const cached = cache.questionnaires.get(id);
    if (cached) {
      cache.questionnaires.set({ ...cached, active } as WithId<Questionnaire>);
    }
  });
  await touchMetaConfig();
}

export async function deleteQuestionnaire(questionnaireId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  const questionsRef = collection(db, "questionnaires", questionnaireId, "questions");
  const snapshot = await getDocs(questionsRef);
  if (!snapshot.empty) {
    const batches: Array<ReturnType<typeof writeBatch>> = [];
    let batch = writeBatch(db);
    let counter = 0;
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      counter += 1;
      if (counter >= 400) {
        batches.push(batch);
        batch = writeBatch(db);
        counter = 0;
      }
    });
    if (counter > 0) batches.push(batch);
    for (const b of batches) {
      await b.commit();
    }
  }

  await deleteDoc(doc(db, "questionnaires", questionnaireId));
  cache.questionnaires.clear();
  await touchMetaConfig();
}
