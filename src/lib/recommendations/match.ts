import type { Product, ProductRecommendationScenario, WithId } from "@/lib/firestore/types";

export type RecommendationInput = {
  level?: string;
  style?: string;
  distance?: string;
  priority?: string;
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  preferences?: string[];
};

export type ProductMatch = {
  product: WithId<Product>;
  scenario: ProductRecommendationScenario;
  fitScore: number;
  matchedPreferences: string[];
};

const includesOrAny = (allowed: string[] | undefined, value: string | undefined) => {
  if (!allowed?.length) return true;
  if (!value) return false;
  return allowed.includes(value);
};

const normalizePreferenceKey = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(control|controlul|controle)/.test(normalized)) return "control";
  if (/(spin)/.test(normalized)) return "spin";
  if (/(speed|viteza|vitez|speed)/.test(normalized)) return "speed";
  if (/(weight|greut|greutate)/.test(normalized)) return "weight";
  return null;
};

const getPreferenceKeys = (preferences: string[] | undefined) => {
  if (!preferences?.length) return [];
  const keys = new Set<string>();
  preferences.forEach((value) => {
    const key = normalizePreferenceKey(value);
    if (key) keys.add(key);
  });
  return [...keys];
};

const calculateFitScore = (product: WithId<Product>, preferenceKeys: string[]) => {
  if (!preferenceKeys.length) return 0;
  const { attributes } = product;
  const scores = preferenceKeys.map((key) => {
    const value = attributes?.[key as keyof typeof attributes];
    return Number.isFinite(value) ? Number(value) : 0;
  });
  const total = scores.reduce((sum, value) => sum + value, 0);
  return total / preferenceKeys.length;
};

const matchesScenario = (
  scenario: ProductRecommendationScenario,
  input: RecommendationInput,
  product: WithId<Product>,
) => {
  const c = scenario.conditions ?? {};
  if (!includesOrAny(c.level, input.level)) return false;
  if (!includesOrAny(c.style, input.style)) return false;
  if (!includesOrAny(c.distance, input.distance)) return false;
  if (!includesOrAny(c.priority, input.priority)) return false;

  const userBudgetMin = input.budgetMin ?? input.budget;
  const userBudgetMax = input.budgetMax ?? input.budget;

  if (userBudgetMin !== undefined && product.price < userBudgetMin) return false;
  if (userBudgetMax !== undefined && product.price > userBudgetMax) return false;

  if (userBudgetMin !== undefined && c.budgetMax !== undefined && c.budgetMax < userBudgetMin) return false;
  if (userBudgetMax !== undefined && c.budgetMin !== undefined && c.budgetMin > userBudgetMax) return false;
  return true;
};

export function matchProductScenarios(params: {
  products: WithId<Product>[];
  input: RecommendationInput;
}): ProductMatch[] {
  const matches: ProductMatch[] = [];
  const preferenceKeys = getPreferenceKeys(params.input.preferences);
  params.products.forEach((product) => {
    const scenarios = product.recommendationScenarios ?? [];
    scenarios
      .filter((s) => s.active)
      .forEach((scenario) => {
        if (matchesScenario(scenario, params.input, product)) {
          matches.push({
            product,
            scenario,
            fitScore: calculateFitScore(product, preferenceKeys),
            matchedPreferences: preferenceKeys,
          });
        }
      });
  });

  return matches
    .sort((a, b) => {
      if (a.scenario.order !== b.scenario.order) return a.scenario.order - b.scenario.order;
      if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
      if (a.product.price !== b.product.price) return a.product.price - b.product.price;
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, 5);
}
