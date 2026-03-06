"use client";

import type { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

import { initFirebase } from "@/lib/firebase/client";

export type ComputeRecommendationsRequest = {
  questionnaireId: string;
  answers: Record<string, unknown>;
  debug?: boolean;
};

export type RecommendationInput = {
  level?: string;
  style?: string;
  distance?: string;
  priority?: string;
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  preferences?: string[];
  selectionsByKey?: Record<string, string[]>;
};

export type RecommendationSkippedQuestion = {
  questionId: string;
  reason: "rule_not_met" | "inactive" | "prerequisite_not_answered";
};

type RecommendationScenario = {
  active: boolean;
  order: number;
  explanationTemplate: string;
  conditions: Record<string, string[] | number | undefined>;
};

type ProductLite = {
  id: string;
  active: boolean;
  name: string;
  brand?: string;
  imageUrls?: string[];
  imageUrl?: string;
  productUrl?: string;
  price: number;
  currency: "EUR" | "RON";
  tags: { level: string[]; style: string[]; distance: string[] };
  attributes: { control?: number; spin?: number; speed?: number };
  source?: { provider: "prestashop"; prestashopProductId: string };
};

type PackageLite = {
  id: string;
  active: boolean;
  title: string;
  description?: string;
  mode: "single" | "triple" | "custom";
  items: Array<{ role?: "single" | "blade" | "forehand" | "backhand"; productId: string }>;
  attributes?: { control?: number; spin?: number; speed?: number };
  totalPrice: number;
  currency: "EUR" | "RON";
};

export type ProductMatch = {
  product: ProductLite;
  scenario: RecommendationScenario;
  fitScore: number;
  matchPercent: number;
  matchedPreferences: string[];
  debug?: unknown;
};

export type PackageMatch = {
  package: PackageLite;
  scenario: RecommendationScenario;
  fitScore: number;
  matchPercent: number;
  matchedPreferences: string[];
  debug?: unknown;
};

export type ComputeRecommendationsResponse = {
  questionnaireId: string;
  input: RecommendationInput;
  askedQuestionIds: string[];
  askedKeys: string[];
  skippedQuestions: RecommendationSkippedQuestion[];
  minMatchPercent: number;
  orderedQuestionCount: number;
  totalQuestionCount: number;
  resultMode: "packages" | "products";
  productMatches: ProductMatch[];
  packageMatches: PackageMatch[];
};

const toClientErrorMessage = (err: unknown) => {
  const firebaseError = err as FirebaseError & { code?: string; message?: string };
  if (firebaseError?.code === "functions/unauthenticated") {
    return "Trebuie să fii autentificat pentru a calcula recomandările.";
  }
  if (firebaseError?.code === "functions/invalid-argument") {
    return "Datele trimise pentru calcul sunt invalide.";
  }
  if (firebaseError?.code === "functions/unavailable") {
    return "Serviciul de recomandări nu este disponibil momentan.";
  }
  return firebaseError?.message || "Calculul recomandărilor a eșuat.";
};

export async function computeRecommendations(
  input: ComputeRecommendationsRequest,
): Promise<ComputeRecommendationsResponse> {
  const { app } = initFirebase();
  if (!app) {
    throw new Error("Firebase nu este configurat.");
  }

  try {
    const functions = getFunctions(app, "europe-west1");
    const callable = httpsCallable<ComputeRecommendationsRequest, ComputeRecommendationsResponse>(
      functions,
      "computeRecommendations",
    );
    const response = await callable(input);
    return response.data;
  } catch (err) {
    throw new Error(toClientErrorMessage(err));
  }
}
