import { getApps, initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";

import { computeRecommendationsCallable } from "./recommendations/compute";

if (!getApps().length) {
  initializeApp();
}

export const computeRecommendations = onCall({ region: "europe-west1" }, computeRecommendationsCallable);
