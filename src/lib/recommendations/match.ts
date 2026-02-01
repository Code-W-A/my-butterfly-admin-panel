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
  selectionsByKey?: Record<string, string[]>;
};

export type ProductMatch = {
  product: WithId<Product>;
  scenario: ProductRecommendationScenario;
  fitScore: number;
  matchPercent: number;
  matchedPreferences: string[];
  debug?: ProductMatchDebug;
};

export type ProductMatchDebug = {
  threshold: number;
  askedKeys?: string[];
  bestScenarioChosenBecause?: string;
  totals: {
    totalConditions: number;
    matchedConditions: number;
  };
  budget: {
    userBudgetMin?: number;
    userBudgetMax?: number;
    productPrice: number;
    isBudgetOk: boolean;
    reason?: "below_min" | "above_max";
  };
  conditions: Array<{
    key: string;
    allowed: string[];
    selected: string[];
    counted: boolean;
    matched: boolean;
    status: "matched" | "unanswered" | "not_counted";
  }>;
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

const calculateMatchPercent = (
  scenario: ProductRecommendationScenario,
  input: RecommendationInput,
  product: WithId<Product>,
  askedKeySet?: Set<string>,
  debug?: boolean,
  threshold?: number,
) => {
  const c = scenario.conditions ?? {};
  const selectionForKey = (key: string) => {
    const fromMap = input.selectionsByKey?.[key];
    if (fromMap?.length) return fromMap;
    if (key === "level" && input.level) return [input.level];
    if (key === "style" && input.style) return [input.style];
    if (key === "distance" && input.distance) return [input.distance];
    if (key === "priority" && input.priority) return [input.priority];
    if (key === "preferences" && input.preferences?.length) return input.preferences;
    return [];
  };

  let totalConditions = 0;
  let matchedConditions = 0;
  const conditionDebug: ProductMatchDebug["conditions"] = [];

  for (const [key, allowed] of Object.entries(c)) {
    if (key === "budgetMin" || key === "budgetMax") continue;
    if (!Array.isArray(allowed) || allowed.length === 0) continue;
    const selected = selectionForKey(key);
    const counted = !askedKeySet || askedKeySet.has(key);
    const matched = counted && selected.length > 0 && selected.some((value) => allowed.includes(value));
    if (counted) {
      totalConditions += 1;
      if (matched) matchedConditions += 1;
    }
    if (debug) {
      conditionDebug.push({
        key,
        allowed: allowed.map(String),
        selected: selected.map(String),
        counted,
        matched,
        status: !counted ? "not_counted" : matched ? "matched" : "unanswered",
      });
    }
  }

  const userBudgetMin = input.budgetMin ?? input.budget;
  const userBudgetMax = input.budgetMax ?? input.budget;

  if (userBudgetMin !== undefined && product.price < userBudgetMin) {
    return {
      isBudgetOk: false,
      matchPercent: 0,
      debug: debug
        ? ({
            threshold: threshold ?? 65,
            askedKeys: askedKeySet ? Array.from(askedKeySet) : undefined,
            totals: { totalConditions, matchedConditions },
            budget: {
              userBudgetMin,
              userBudgetMax,
              productPrice: product.price,
              isBudgetOk: false,
              reason: "below_min",
            },
            conditions: conditionDebug,
          } satisfies ProductMatchDebug)
        : undefined,
    };
  }
  if (userBudgetMax !== undefined && product.price > userBudgetMax) {
    return {
      isBudgetOk: false,
      matchPercent: 0,
      debug: debug
        ? ({
            threshold: threshold ?? 65,
            askedKeys: askedKeySet ? Array.from(askedKeySet) : undefined,
            totals: { totalConditions, matchedConditions },
            budget: {
              userBudgetMin,
              userBudgetMax,
              productPrice: product.price,
              isBudgetOk: false,
              reason: "above_max",
            },
            conditions: conditionDebug,
          } satisfies ProductMatchDebug)
        : undefined,
    };
  }

  const matchPercent = totalConditions === 0 ? 100 : Math.round((matchedConditions / totalConditions) * 100);

  return {
    isBudgetOk: true,
    matchPercent,
    debug: debug
      ? ({
          threshold: threshold ?? 65,
          askedKeys: askedKeySet ? Array.from(askedKeySet) : undefined,
          totals: { totalConditions, matchedConditions },
          budget: { userBudgetMin, userBudgetMax, productPrice: product.price, isBudgetOk: true },
          conditions: conditionDebug,
        } satisfies ProductMatchDebug)
      : undefined,
  };
};

export function matchProductScenarios(params: {
  products: WithId<Product>[];
  input: RecommendationInput;
  minMatchPercent?: number;
  askedKeys?: string[];
  debug?: boolean;
}): ProductMatch[] {
  const matches: ProductMatch[] = [];
  const preferenceKeys = getPreferenceKeys(params.input.preferences);
  const threshold = Number.isFinite(params.minMatchPercent) ? (params.minMatchPercent as number) : 65;
  const askedKeySet = params.askedKeys?.length ? new Set(params.askedKeys) : undefined;
  params.products.forEach((product) => {
    const scenarios = product.recommendationScenarios ?? [];
    scenarios
      .filter((s) => s.active)
      .forEach((scenario) => {
        const { isBudgetOk, matchPercent, debug } = calculateMatchPercent(
          scenario,
          params.input,
          product,
          askedKeySet,
          params.debug,
          threshold,
        );
        if (!isBudgetOk) return;
        if (matchPercent < threshold) return;
        if (Number.isNaN(matchPercent)) return;
        matches.push({
          product,
          scenario,
          fitScore: calculateFitScore(product, preferenceKeys),
          matchPercent,
          matchedPreferences: preferenceKeys,
          ...(debug ? { debug } : {}),
        });
      });
  });

  const ordered = matches.sort((a, b) => {
    if (a.matchPercent !== b.matchPercent) return b.matchPercent - a.matchPercent;
    if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
    if (a.product.price !== b.product.price) return b.product.price - a.product.price;
    return a.product.name.localeCompare(b.product.name);
  });

  const byProduct = new Map<string, ProductMatch[]>();
  ordered.forEach((match) => {
    const list = byProduct.get(match.product.id) ?? [];
    list.push(match);
    byProduct.set(match.product.id, list);
  });

  const bestMatches: ProductMatch[] = [];
  byProduct.forEach((list) => {
    const best = list[0];
    const runnerUp = list[1];
    if (best?.debug) {
      if (runnerUp) {
        best.debug.bestScenarioChosenBecause = `Scenariul ales pentru produs deoarece a avut matchPercent ${best.matchPercent}% vs ${runnerUp.matchPercent}% (tie-break: fitScore ${best.fitScore.toFixed(
          2,
        )} vs ${runnerUp.fitScore.toFixed(2)}).`;
      } else {
        best.debug.bestScenarioChosenBecause = `Singurul scenariu eligibil pentru produs după filtre (buget + prag matchPercent) și sortare.`;
      }
    }
    if (best) bestMatches.push(best);
  });

  // Keep the global ordering consistent with the original comparator.
  return bestMatches.sort((a, b) => {
    if (a.matchPercent !== b.matchPercent) return b.matchPercent - a.matchPercent;
    if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
    if (a.product.price !== b.product.price) return b.product.price - a.product.price;
    return a.product.name.localeCompare(b.product.name);
  });
}
