import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { QuestionnaireQuestion, WithId } from "@/lib/firestore/types";

const questionsCollection = (db: NonNullable<ReturnType<typeof initFirebase>["db"]>, questionnaireId: string) =>
  collection(db, "questionnaires", questionnaireId, "questions");

export async function listQuestions(questionnaireId: string): Promise<WithId<QuestionnaireQuestion>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const q = query(questionsCollection(db, questionnaireId), orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as QuestionnaireQuestion),
  }));
}

export async function listAllQuestionOptionValues(): Promise<Set<string>> {
  const { db } = initFirebase();
  if (!db) return new Set();
  const snapshot = await getDocs(query(collectionGroup(db, "questions")));
  const values = new Set<string>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as QuestionnaireQuestion;
    (data.options ?? []).forEach((option) => {
      if (option.value) values.add(option.value);
    });
  });
  return values;
}

export async function createQuestion(
  questionnaireId: string,
  data: Omit<QuestionnaireQuestion, "createdAt" | "updatedAt">,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = await addDoc(questionsCollection(db, questionnaireId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return ref;
}

export async function updateQuestion(questionnaireId: string, questionId: string, data: Record<string, unknown>) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "questionnaires", questionnaireId, "questions", questionId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
}

export async function deleteQuestion(questionnaireId: string, questionId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "questionnaires", questionnaireId, "questions", questionId);
  await deleteDoc(ref);
  await touchMetaConfig();
}
