import { getFirestore } from "firebase-admin/firestore";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

import { matchProductScenarios } from "./match";
import { matchPackageScenarios } from "./match-packages";
import { buildRecommendationInput, computeSkippedQuestions, getOrderedQuestions } from "./questionnaire";
import type {
  ComputeRecommendationsRequest,
  ComputeRecommendationsResponse,
  PackageLite,
  Product,
  ProductLite,
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

export const resolveResultMode = (packageMatchCount: number): "packages" | "products" =>
  packageMatchCount > 0 ? "packages" : "products";

const toProductLite = (product: WithId<Product>): ProductLite => ({
  id: product.id,
  active: Boolean(product.active),
  name: product.name,
  ...(product.brand ? { brand: product.brand } : {}),
  ...(product.imageUrls?.length ? { imageUrls: product.imageUrls } : {}),
  ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
  ...(product.productUrl ? { productUrl: product.productUrl } : {}),
  price: Number(product.price ?? 0),
  currency: product.currency === "EUR" ? "EUR" : "RON",
  tags: {
    level: product.tags?.level ?? [],
    style: product.tags?.style ?? [],
    distance: product.tags?.distance ?? [],
  },
  attributes: {
    ...(product.attributes?.control !== undefined ? { control: product.attributes.control } : {}),
    ...(product.attributes?.spin !== undefined ? { spin: product.attributes.spin } : {}),
    ...(product.attributes?.speed !== undefined ? { speed: product.attributes.speed } : {}),
  },
  ...(product.source?.provider === "prestashop" && product.source.prestashopProductId
    ? {
        source: {
          provider: "prestashop" as const,
          prestashopProductId: product.source.prestashopProductId,
        },
      }
    : {}),
});

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

  const productsById = new Map(products.map((product) => [product.id, product]));

  const productMatches = matchProductScenarios({
    products,
    input,
    minMatchPercent,
    askedKeys,
    questionnaireKeys,
    debug: payload.debug,
  });

  const packageMatches = matchPackageScenarios({
    packages,
    productsById,
    input,
    minMatchPercent,
    askedKeys,
    questionnaireKeys,
    debug: payload.debug,
  });

  const resultMode = resolveResultMode(packageMatches.length);

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
    productMatches: productMatches.map((match) => ({
      product: toProductLite(match.product),
      scenario: match.scenario,
      fitScore: match.fitScore,
      matchPercent: match.matchPercent,
      matchedPreferences: match.matchedPreferences,
      ...(match.debug ? { debug: match.debug } : {}),
    })),
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
