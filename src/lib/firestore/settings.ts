import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import {
  DEFAULT_EUR_RON_EXCHANGE_RATE,
  DEFAULT_VAT_PERCENT,
  sanitizeExchangeRate,
  sanitizeVatPercent,
} from "@/lib/pricing/prestashop-price";

export type RecommendationSettings = {
  minMatchPercent: number;
  exchangeRateEurRon: number;
  vatPercent: number;
};

const SETTINGS_COLLECTION = "app_settings";
const RECOMMENDATIONS_DOC = "recommendations";
const DEFAULT_MIN_MATCH_PERCENT = 65;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const buildSettings = (data?: Partial<RecommendationSettings> | null): RecommendationSettings => ({
  minMatchPercent:
    typeof data?.minMatchPercent === "number" ? clampPercent(data.minMatchPercent) : DEFAULT_MIN_MATCH_PERCENT,
  exchangeRateEurRon: sanitizeExchangeRate(data?.exchangeRateEurRon ?? DEFAULT_EUR_RON_EXCHANGE_RATE),
  vatPercent: sanitizeVatPercent(data?.vatPercent ?? DEFAULT_VAT_PERCENT),
});

export async function getRecommendationSettings(): Promise<RecommendationSettings> {
  const { db } = initFirebase();
  if (!db) return buildSettings();
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return buildSettings();
  const data = snapshot.data() as Partial<RecommendationSettings>;
  return buildSettings(data);
}

export async function updateRecommendationSettings(patch: Partial<RecommendationSettings>) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.minMatchPercent !== undefined) {
    payload.minMatchPercent = clampPercent(patch.minMatchPercent);
  }
  if (patch.exchangeRateEurRon !== undefined) {
    payload.exchangeRateEurRon = sanitizeExchangeRate(patch.exchangeRateEurRon);
  }
  if (patch.vatPercent !== undefined) {
    payload.vatPercent = sanitizeVatPercent(patch.vatPercent);
  }
  await setDoc(ref, payload, { merge: true });
  await touchMetaConfig();
}
