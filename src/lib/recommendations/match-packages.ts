import type {
  PackageItemRole,
  Product,
  ProductRecommendationScenario,
  RecommendationPackage,
  WithId,
} from "@/lib/firestore/types";
import type { RecommendationInput } from "@/lib/recommendations/match";

export type PackageMatchDebug = {
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
    packagePrice: number;
    isBudgetOk: boolean;
    reason?: "below_min" | "above_max";
  };
  conditions: Array<{
    key: string;
    allowed: string[];
    selected: string[];
    counted: boolean;
    matched: boolean;
    status: "matched" | "unanswered" | "not_counted" | "missing_in_questionnaire";
  }>;
};

export type PackageMatch = {
  package: WithId<RecommendationPackage>;
  scenario: ProductRecommendationScenario;
  fitScore: number;
  matchPercent: number;
  matchedPreferences: string[];
  debug?: PackageMatchDebug;
};

const normalizePreferenceKey = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(control|controlul|controle)/.test(normalized)) return "control";
  if (/(spin)/.test(normalized)) return "spin";
  if (/(speed|viteza|vitez)/.test(normalized)) return "speed";
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

const isPackageShapeEligible = (pkg: WithId<RecommendationPackage>) => {
  const items = pkg.items ?? [];
  const roles = items.map((item) => item.role);
  if (pkg.mode === "single") {
    return items.length === 1 && roles[0] === "single";
  }
  if (pkg.mode === "triple") {
    if (items.length !== 3) return false;
    if (roles.some((role) => !role)) return false;
    const expected = new Set<PackageItemRole>(["blade", "rubber_fh", "rubber_bh"]);
    const actual = new Set<PackageItemRole>(roles as PackageItemRole[]);
    return expected.size === actual.size && [...expected].every((role) => actual.has(role));
  }

  if (items.length < 1 || items.length > 10) return false;
  if (items.some((item) => !item.productId?.trim())) return false;
  const ids = items.map((item) => item.productId.trim());
  return new Set(ids).size === ids.length;
};

const getPackageProducts = (
  pkg: WithId<RecommendationPackage>,
  productsById: Map<string, WithId<Product>>,
): WithId<Product>[] => {
  if (!pkg.items?.length) return [];
  if (!isPackageShapeEligible(pkg)) return [];

  const products: WithId<Product>[] = [];
  for (const item of pkg.items) {
    const product = productsById.get(item.productId);
    if (!product) return [];
    products.push(product);
  }
  return products;
};

const calculateFitScore = (
  pkg: WithId<RecommendationPackage>,
  products: WithId<Product>[],
  preferenceKeys: string[],
): number => {
  if (!preferenceKeys.length || !products.length) return 0;

  const blade = pkg.items.find((item) => item.role === "blade");
  const targetProducts =
    blade && products.find((product) => product.id === blade.productId)
      ? [products.find((product) => product.id === blade.productId) as WithId<Product>]
      : products;

  const perProductScores = targetProducts.map((product) => {
    const scores = preferenceKeys.map((key) => {
      const value = product.attributes?.[key as keyof typeof product.attributes];
      return Number.isFinite(value) ? Number(value) : 0;
    });
    const total = scores.reduce((sum, score) => sum + score, 0);
    return total / preferenceKeys.length;
  });

  const total = perProductScores.reduce((sum, score) => sum + score, 0);
  return total / perProductScores.length;
};

const calculateMatchPercent = (
  scenario: ProductRecommendationScenario,
  input: RecommendationInput,
  totalPrice: number,
  askedKeySet?: Set<string>,
  questionnaireKeySet?: Set<string>,
  debug?: boolean,
  threshold?: number,
) => {
  const conditions = scenario.conditions ?? {};
  const selectForKey = (key: string) => {
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
  const conditionDebug: PackageMatchDebug["conditions"] = [];

  for (const [key, allowed] of Object.entries(conditions)) {
    if (key === "budgetMin" || key === "budgetMax") continue;
    if (!Array.isArray(allowed) || allowed.length === 0) continue;

    const selected = selectForKey(key);
    const missingInQuestionnaire = Boolean(questionnaireKeySet && !questionnaireKeySet.has(key));
    const isAsked = !askedKeySet || askedKeySet.has(key);
    const counted = missingInQuestionnaire || isAsked;
    const matched =
      counted && !missingInQuestionnaire && selected.length > 0 && selected.some((value) => allowed.includes(value));
    if (counted) {
      totalConditions += 1;
      if (matched) matchedConditions += 1;
    }

    if (debug) {
      const status = missingInQuestionnaire
        ? "missing_in_questionnaire"
        : !isAsked
          ? "not_counted"
          : matched
            ? "matched"
            : "unanswered";
      conditionDebug.push({
        key,
        allowed: allowed.map(String),
        selected: selected.map(String),
        counted,
        matched,
        status,
      });
    }
  }

  const userBudgetMin = input.budgetMin ?? input.budget;
  const userBudgetMax = input.budgetMax ?? input.budget;

  if (userBudgetMin !== undefined && totalPrice < userBudgetMin) {
    return {
      isBudgetOk: false,
      matchPercent: 0,
      debug: debug
        ? ({
            threshold: threshold ?? 65,
            askedKeys: askedKeySet ? [...askedKeySet] : undefined,
            totals: { totalConditions, matchedConditions },
            budget: {
              userBudgetMin,
              userBudgetMax,
              packagePrice: totalPrice,
              isBudgetOk: false,
              reason: "below_min",
            },
            conditions: conditionDebug,
          } satisfies PackageMatchDebug)
        : undefined,
    };
  }

  if (userBudgetMax !== undefined && totalPrice > userBudgetMax) {
    return {
      isBudgetOk: false,
      matchPercent: 0,
      debug: debug
        ? ({
            threshold: threshold ?? 65,
            askedKeys: askedKeySet ? [...askedKeySet] : undefined,
            totals: { totalConditions, matchedConditions },
            budget: {
              userBudgetMin,
              userBudgetMax,
              packagePrice: totalPrice,
              isBudgetOk: false,
              reason: "above_max",
            },
            conditions: conditionDebug,
          } satisfies PackageMatchDebug)
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
          askedKeys: askedKeySet ? [...askedKeySet] : undefined,
          totals: { totalConditions, matchedConditions },
          budget: { userBudgetMin, userBudgetMax, packagePrice: totalPrice, isBudgetOk: true },
          conditions: conditionDebug,
        } satisfies PackageMatchDebug)
      : undefined,
  };
};

const sortMatches = (a: PackageMatch, b: PackageMatch) => {
  if (a.matchPercent !== b.matchPercent) return b.matchPercent - a.matchPercent;
  if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
  if (a.package.totalPrice !== b.package.totalPrice) return a.package.totalPrice - b.package.totalPrice;
  return a.package.title.localeCompare(b.package.title);
};

export function matchPackageScenarios(params: {
  packages: WithId<RecommendationPackage>[];
  productsById: Map<string, WithId<Product>>;
  input: RecommendationInput;
  minMatchPercent?: number;
  askedKeys?: string[];
  questionnaireKeys?: string[];
  debug?: boolean;
}): PackageMatch[] {
  const threshold = Number.isFinite(params.minMatchPercent) ? (params.minMatchPercent as number) : 65;
  const preferenceKeys = getPreferenceKeys(params.input.preferences);
  const askedKeySet = params.askedKeys?.length ? new Set(params.askedKeys) : undefined;
  const questionnaireKeySet = params.questionnaireKeys?.length ? new Set(params.questionnaireKeys) : undefined;

  const matches: PackageMatch[] = [];
  params.packages.forEach((pkg) => {
    if (!pkg.active) return;
    const packageProducts = getPackageProducts(pkg, params.productsById);
    if (!packageProducts.length) return;

    const packageCurrencies = new Set(packageProducts.map((product) => product.currency));
    if (packageCurrencies.size !== 1) return;

    const computedTotalPrice = Number(
      packageProducts.reduce((sum, product) => sum + Number(product.price ?? 0), 0).toFixed(2),
    );
    const totalPrice = Number.isFinite(pkg.totalPrice) ? Number(pkg.totalPrice) : computedTotalPrice;
    const scenarios = (pkg.recommendationScenarios ?? []).filter((scenario) => scenario.active);

    scenarios.forEach((scenario) => {
      const { isBudgetOk, matchPercent, debug } = calculateMatchPercent(
        scenario,
        params.input,
        totalPrice,
        askedKeySet,
        questionnaireKeySet,
        params.debug,
        threshold,
      );
      if (!isBudgetOk) return;
      if (Number.isNaN(matchPercent) || matchPercent < threshold) return;

      matches.push({
        package: { ...pkg, totalPrice, currency: packageProducts[0].currency },
        scenario,
        fitScore: calculateFitScore(pkg, packageProducts, preferenceKeys),
        matchPercent,
        matchedPreferences: preferenceKeys,
        ...(debug ? { debug } : {}),
      });
    });
  });

  const ordered = matches.sort(sortMatches);
  const byPackage = new Map<string, PackageMatch[]>();
  ordered.forEach((match) => {
    const list = byPackage.get(match.package.id) ?? [];
    list.push(match);
    byPackage.set(match.package.id, list);
  });

  const bestMatches: PackageMatch[] = [];
  byPackage.forEach((list) => {
    const best = list[0];
    const runnerUp = list[1];
    if (best?.debug) {
      if (runnerUp) {
        best.debug.bestScenarioChosenBecause = `Scenariul ales pentru pachet deoarece a avut matchPercent ${best.matchPercent}% vs ${runnerUp.matchPercent}% (tie-break: fitScore ${best.fitScore.toFixed(
          2,
        )} vs ${runnerUp.fitScore.toFixed(2)}).`;
      } else {
        best.debug.bestScenarioChosenBecause =
          "Singurul scenariu eligibil pentru pachet după filtre (buget + prag matchPercent) și sortare.";
      }
    }
    if (best) bestMatches.push(best);
  });

  return bestMatches.sort(sortMatches);
}
