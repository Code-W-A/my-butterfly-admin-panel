import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

import { evaluatePackageScenarios } from "./match-packages";
import { buildRecommendationInput, computeSkippedQuestions, getOrderedQuestions } from "./questionnaire";
import type {
  ComputeRecommendationsRequest,
  ComputeRecommendationsResponse,
  PackageLite,
  Product,
  QuestionnaireQuestion,
  RecommendationPackage,
  RecommendationSkippedQuestion,
  WithId,
} from "./types";

const DEFAULT_MIN_MATCH_PERCENT = 65;

const requestSchema = z.object({
  questionnaireId: z.string().trim().min(1, "questionnaireId este obligatoriu."),
  answers: z.record(z.unknown()),
  debug: z.boolean().optional(),
});

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const parseComputeRecommendationsRequest = (data: unknown): ComputeRecommendationsRequest => {
  const parsed = requestSchema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Payload invalid pentru computeRecommendations.");
  }
  return parsed.data;
};

export const ensureAuthenticated = (auth: CallableRequest<unknown>["auth"]) => {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Trebuie să fii autentificat.");
  }
  return auth.uid;
};

export const resolveResultMode = (): "packages" => "packages";

const toCanonicalPackageRole = (role: unknown): PackageLite["items"][number]["role"] => {
  if (role === "single" || role === "blade" || role === "forehand" || role === "backhand") return role;
  if (role === "rubber_fh") return "forehand";
  if (role === "rubber_bh") return "backhand";
  return undefined;
};

const toPackageLite = (pkg: WithId<RecommendationPackage>): PackageLite => ({
  id: pkg.id,
  active: Boolean(pkg.active),
  title: pkg.title,
  ...(pkg.description?.trim() ? { description: pkg.description } : {}),
  mode: pkg.mode,
  items: (pkg.items ?? []).map((item) => {
    const role = toCanonicalPackageRole(item.role);
    return {
      productId: item.productId,
      ...(role ? { role } : {}),
    };
  }),
  ...(pkg.attributes
    ? {
        attributes: {
          ...(pkg.attributes.control !== undefined ? { control: pkg.attributes.control } : {}),
          ...(pkg.attributes.spin !== undefined ? { spin: pkg.attributes.spin } : {}),
          ...(pkg.attributes.speed !== undefined ? { speed: pkg.attributes.speed } : {}),
        },
      }
    : {}),
  totalPrice: Number(pkg.totalPrice ?? 0),
  currency: pkg.currency === "EUR" ? "EUR" : "RON",
});

const getRecommendationMinMatch = async () => {
  const db = getFirestore();
  const snapshot = await db.collection("app_settings").doc("recommendations").get();
  const value = snapshot.data()?.minMatchPercent;
  return typeof value === "number" ? clampPercent(value) : DEFAULT_MIN_MATCH_PERCENT;
};

const listActiveProducts = async (): Promise<WithId<Product>[]> => {
  const db = getFirestore();
  const snapshot = await db
    .collection("products")
    .where("active", "==", true)
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Product) }));
};

const listActivePackages = async (): Promise<WithId<RecommendationPackage>[]> => {
  const db = getFirestore();
  const snapshot = await db
    .collection("recommendation_packages")
    .where("active", "==", true)
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as RecommendationPackage) }));
};

const listQuestionnaireQuestions = async (questionnaireId: string): Promise<QuestionnaireQuestion[]> => {
  const db = getFirestore();
  const questionnaireRef = db.collection("questionnaires").doc(questionnaireId);
  const questionnaireSnap = await questionnaireRef.get();
  if (!questionnaireSnap.exists) {
    throw new HttpsError("invalid-argument", "Chestionarul selectat nu există.");
  }
  const questionsSnapshot = await questionnaireRef.collection("questions").orderBy("order", "asc").get();
  return questionsSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<QuestionnaireQuestion, "id">),
  }));
};

export async function computeRecommendationsCallable(
  request: CallableRequest<unknown>,
): Promise<ComputeRecommendationsResponse> {
  ensureAuthenticated(request.auth);
  const payload = parseComputeRecommendationsRequest(request.data);

  const [questions, products, packages, minMatchPercent] = await Promise.all([
    listQuestionnaireQuestions(payload.questionnaireId),
    listActiveProducts(),
    listActivePackages(),
    getRecommendationMinMatch(),
  ]);

  const orderedQuestions = getOrderedQuestions(questions, payload.answers);
  const askedQuestionIds = orderedQuestions.map((question) => question.id);
  const askedKeys = orderedQuestions.map((question) => question.key);
  const questionnaireKeys = Array.from(
    new Set(
      questions
        .filter((question) => question.active)
        .map((question) => question.key)
        .filter(Boolean),
    ),
  );
  const { input } = buildRecommendationInput(orderedQuestions, payload.answers);
  const skippedQuestions: RecommendationSkippedQuestion[] = computeSkippedQuestions(
    questions,
    orderedQuestions,
    payload.answers,
  );
  const skippedReasonCounts = skippedQuestions.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});

  const productsById = new Map(products.map((product) => [product.id, product]));

  const { matches: packageMatches, diagnostics: packageDiagnostics } = evaluatePackageScenarios({
    packages,
    productsById,
    input,
    minMatchPercent,
    askedKeys,
    questionnaireKeys,
    debug: payload.debug,
  });

  const resultMode = resolveResultMode();

  logger.info("computeRecommendations summary", {
    questionnaireId: payload.questionnaireId,
    debug: Boolean(payload.debug),
    totalQuestionCount: questions.length,
    orderedQuestionCount: orderedQuestions.length,
    askedQuestionIdsCount: askedQuestionIds.length,
    askedKeys,
    skippedReasonCounts,
    minMatchPercent,
    loadedProductsCount: products.length,
    loadedPackagesCount: packages.length,
    packageMatchCount: packageMatches.length,
    resultMode,
    packageDiagnostics,
  });

  if (packageMatches.length === 0) {
    logger.warn("computeRecommendations produced zero package matches", {
      questionnaireId: payload.questionnaireId,
      askedKeys,
      minMatchPercent,
      loadedProductsCount: products.length,
      loadedPackagesCount: packages.length,
      packageDiagnostics,
    });
  }

  return {
    questionnaireId: payload.questionnaireId,
    input,
    askedQuestionIds,
    askedKeys,
    skippedQuestions,
    minMatchPercent,
    orderedQuestionCount: orderedQuestions.length,
    totalQuestionCount: questions.length,
    resultMode,
    productMatches: [],
    packageMatches: packageMatches.map((match) => ({
      package: toPackageLite(match.package),
      scenario: match.scenario,
      fitScore: match.fitScore,
      matchPercent: match.matchPercent,
      matchedPreferences: match.matchedPreferences,
      ...(match.debug ? { debug: match.debug } : {}),
    })),
  };
}
