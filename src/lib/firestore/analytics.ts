import { collectionGroup, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import type { QuestionnaireAnalyticsDaily, WithId } from "@/lib/firestore/types";

export type QuestionnaireAnalyticsDailyWithUser = WithId<QuestionnaireAnalyticsDaily> & { userId: string };

export async function listQuestionnaireAnalyticsDailyInRange(params: {
  questionnaireId: string;
  since: Date;
  untilExclusive?: Date;
  order?: "asc" | "desc";
  max?: number;
}): Promise<QuestionnaireAnalyticsDailyWithUser[]> {
  const { db } = initFirebase();
  if (!db) return [];

  const max = params.max ?? 2000;
  const order = params.order ?? "asc";

  const constraints = [
    where("questionnaireId", "==", params.questionnaireId),
    where("day", ">=", Timestamp.fromDate(params.since)),
    ...(params.untilExclusive ? [where("day", "<", Timestamp.fromDate(params.untilExclusive))] : []),
    orderBy("day", order),
    limit(max),
  ] as const;

  // NOTE: Firestore may require a composite index for questionnaireId + day range queries.
  const q = query(collectionGroup(db, "questionnaireAnalyticsDaily"), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const parentUserId = docSnap.ref.parent.parent?.id;
    return {
      id: docSnap.id,
      userId: parentUserId ?? "",
      ...(docSnap.data() as QuestionnaireAnalyticsDaily),
    };
  });
}
