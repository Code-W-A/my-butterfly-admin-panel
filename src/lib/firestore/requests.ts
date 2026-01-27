import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  documentId,
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
import type { SpecialistRequest, SpecialistRequestReply, WithId } from "@/lib/firestore/types";

type SpecialistRequestWithUser = WithId<SpecialistRequest> & { userId: string };

type ListRequestsParams = {
  status?: SpecialistRequest["status"];
};

export async function listSpecialistRequests(params: ListRequestsParams = {}): Promise<SpecialistRequestWithUser[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const baseQuery =
    params.status !== undefined
      ? query(
          collectionGroup(db, "specialistRequests"),
          where("status", "==", params.status),
          orderBy("createdAt", "desc"),
        )
      : query(collectionGroup(db, "specialistRequests"), orderBy("createdAt", "desc"));

  // NOTE: Firestore may require a composite index for status + createdAt.
  const snapshot = await getDocs(baseQuery);
  return snapshot.docs.map((docSnap) => {
    const parentUserId = docSnap.ref.parent.parent?.id;
    return {
      id: docSnap.id,
      userId: parentUserId ?? "",
      ...(docSnap.data() as SpecialistRequest),
    };
  });
}

export async function listSpecialistRequestsInRange(params: {
  since: Date;
  untilExclusive?: Date;
  status?: SpecialistRequest["status"];
  order?: "asc" | "desc";
  max?: number;
}): Promise<SpecialistRequestWithUser[]> {
  const { db } = initFirebase();
  if (!db) return [];

  const max = params.max ?? 2000;
  const order = params.order ?? "asc";

  const constraints = [
    where("createdAt", ">=", Timestamp.fromDate(params.since)),
    ...(params.untilExclusive ? [where("createdAt", "<", Timestamp.fromDate(params.untilExclusive))] : []),
    ...(params.status !== undefined ? [where("status", "==", params.status)] : []),
    orderBy("createdAt", order),
    limit(max),
  ] as const;

  // NOTE: Firestore may require a composite index for status + createdAt range queries.
  const q = query(collectionGroup(db, "specialistRequests"), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const parentUserId = docSnap.ref.parent.parent?.id;
    return {
      id: docSnap.id,
      userId: parentUserId ?? "",
      ...(docSnap.data() as SpecialistRequest),
    };
  });
}

export async function listSpecialistRequestsPage(params: {
  status?: SpecialistRequest["status"];
  pageSize?: number;
  cursor?: QueryDocumentSnapshot;
}): Promise<{ items: SpecialistRequestWithUser[]; cursor?: QueryDocumentSnapshot }> {
  const { db } = initFirebase();
  if (!db) return { items: [], cursor: undefined };
  const pageSize = params.pageSize ?? 20;
  const baseQuery =
    params.status !== undefined
      ? query(
          collectionGroup(db, "specialistRequests"),
          where("status", "==", params.status),
          orderBy("createdAt", "desc"),
        )
      : query(collectionGroup(db, "specialistRequests"), orderBy("createdAt", "desc"));
  const q = params.cursor
    ? query(baseQuery, startAfter(params.cursor), limit(pageSize))
    : query(baseQuery, limit(pageSize));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => {
    const parentUserId = docSnap.ref.parent.parent?.id;
    return {
      id: docSnap.id,
      userId: parentUserId ?? "",
      ...(docSnap.data() as SpecialistRequest),
    };
  });
  const nextCursor = snapshot.docs[snapshot.docs.length - 1];
  return { items, cursor: nextCursor };
}

export async function createSpecialistRequest(
  userId: string,
  data: Omit<SpecialistRequest, "createdAt" | "status"> & { status?: SpecialistRequest["status"] },
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = collection(db, "users", userId, "specialistRequests");
  return addDoc(ref, {
    ...data,
    status: data.status ?? "new",
    createdAt: serverTimestamp(),
  });
}

export async function getSpecialistRequestById(requestId: string): Promise<SpecialistRequestWithUser | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const q = query(collectionGroup(db, "specialistRequests"), where(documentId(), "==", requestId));
  const snapshot = await getDocs(q);
  const docSnap = snapshot.docs[0];
  if (!docSnap) return null;
  const parentUserId = docSnap.ref.parent.parent?.id;
  return {
    id: docSnap.id,
    userId: parentUserId ?? "",
    ...(docSnap.data() as SpecialistRequest),
  };
}

export async function updateSpecialistRequestStatus(
  userId: string,
  requestId: string,
  status: SpecialistRequest["status"],
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "users", userId, "specialistRequests", requestId);
  return updateDoc(ref, {
    status,
  });
}

export async function setSpecialistRequestReply(
  userId: string,
  requestId: string,
  reply: Omit<SpecialistRequestReply, "sentAt">,
) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "users", userId, "specialistRequests", requestId);
  return updateDoc(ref, {
    status: "sent",
    reply: {
      ...reply,
      sentAt: serverTimestamp(),
    },
  });
}
