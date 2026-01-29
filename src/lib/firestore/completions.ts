import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import type { QuestionnaireCompletion, WithId } from "@/lib/firestore/types";

export async function listQuestionnaireCompletionsPage(params: {
  questionnaireId?: string;
  since?: Date;
  untilExclusive?: Date;
  pageSize?: number;
  cursor?: QueryDocumentSnapshot;
}): Promise<{ items: WithId<QuestionnaireCompletion>[]; cursor?: QueryDocumentSnapshot }> {
  const { db } = initFirebase();
  if (!db) return { items: [], cursor: undefined };
  const pageSize = params.pageSize ?? 20;

  const constraints = [
    ...(params.questionnaireId ? [where("questionnaireId", "==", params.questionnaireId)] : []),
    ...(params.since ? [where("createdAt", ">=", Timestamp.fromDate(params.since))] : []),
    ...(params.untilExclusive ? [where("createdAt", "<", Timestamp.fromDate(params.untilExclusive))] : []),
    orderBy("createdAt", "desc"),
    limit(pageSize),
  ] as const;

  // NOTE: Firestore may require composite indexes for questionnaireId + createdAt range queries.
  const baseQuery = query(collection(db, "questionnaireCompletions"), ...constraints);
  const q = params.cursor ? query(baseQuery, startAfter(params.cursor)) : baseQuery;
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as QuestionnaireCompletion),
  }));
  const nextCursor = snapshot.docs[snapshot.docs.length - 1];
  return { items, cursor: nextCursor };
}

export async function getQuestionnaireCompletionById(
  completionId: string,
): Promise<WithId<QuestionnaireCompletion> | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "questionnaireCompletions", completionId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as QuestionnaireCompletion) };
}

export async function createQuestionnaireCompletion(data: Omit<QuestionnaireCompletion, "createdAt">) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = collection(db, "questionnaireCompletions");
  return addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function setQuestionnaireCompletionSpecialistRequestId(completionId: string, requestId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "questionnaireCompletions", completionId);
  return updateDoc(ref, { specialistRequestId: requestId });
}
