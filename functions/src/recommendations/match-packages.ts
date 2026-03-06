import type {
  PackageItemRole,
  PackageMatch,
  PackageMatchDebug,
  Product,
  ProductRecommendationScenario,
  RecommendationInput,
  RecommendationPackage,
  WithId,
} from "./types";

type PackageDiagnosticsSummary = {
  packageCounts: {
    total: number;
    matched: number;
    invalidShape: number;
    missingProducts: number;
    mixedCurrency: number;
    noActiveScenarios: number;
    rejectedByScenarios: number;
  };
  scenarioOutcomeCounts: {
    matched: number;
    belowThreshold: number;
    budgetBelowMin: number;
    budgetAboveMax: number;
    nanMatchPercent: number;
  };
  sampleRejectedPackages: Array<{
    packageId: string;
    title: string;
    mode: RecommendationPackage["mode"];
    reason:
      | "invalid_shape"
      | "missing_products"
      | "mixed_currency"
      | "no_active_scenarios"
      | "below_threshold"
      | "budget_below_min"
      | "budget_above_max"
      | "nan_match_percent";
    activeScenarioCount: number;
    bestMatchPercent?: number;
    bestScenarioOrder?: number;
    totalPrice?: number;
    currencies?: string[];
    missingProductIds?: string[];
  }>;
  sampleMatchedPackages: Array<{
    packageId: string;
    title: string;
    matchPercent: number;
    scenarioOrder: number;
    totalPrice: number;
  }>;
};

type PackageEvaluationResult = {
  matches: PackageMatch[];
  diagnostics: PackageDiagnosticsSummary;
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

const normalizePackageRole = (role: unknown): PackageItemRole | undefined => {
  if (role === "single" || role === "blade" || role === "forehand" || role === "backhand") return role;
  if (role === "rubber_fh") return "forehand";
  if (role === "rubber_bh") return "backhand";
  return undefined;
};

const isPackageShapeEligible = (pkg: WithId<RecommendationPackage>) => {
  const items = pkg.items ?? [];
  const roles = items.map((item) => normalizePackageRole(item.role));
  if (pkg.mode === "single") {
    return items.length === 1 && roles[0] === "single";
  }
  if (pkg.mode === "triple") {
    if (items.length !== 3) return false;
    if (roles.some((role) => !role)) return false;
    const expected = new Set<PackageItemRole>(["blade", "forehand", "backhand"]);
    const actual = new Set<PackageItemRole>(roles as PackageItemRole[]);
    return expected.size === actual.size && [...expected].every((role) => actual.has(role));
  }

  if (items.length < 1 || items.length > 10) return false;
  if (items.some((item) => !item.productId?.trim())) return false;
  return true;
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

const createPackageDiagnosticsSummary = (): PackageDiagnosticsSummary => ({
  packageCounts: {
    total: 0,
    matched: 0,
    invalidShape: 0,
    missingProducts: 0,
    mixedCurrency: 0,
    noActiveScenarios: 0,
    rejectedByScenarios: 0,
  },
  scenarioOutcomeCounts: {
    matched: 0,
    belowThreshold: 0,
    budgetBelowMin: 0,
    budgetAboveMax: 0,
    nanMatchPercent: 0,
  },
  sampleRejectedPackages: [],
  sampleMatchedPackages: [],
});

const pushRejectedPackageSample = (
  diagnostics: PackageDiagnosticsSummary,
  sample: PackageDiagnosticsSummary["sampleRejectedPackages"][number],
) => {
  if (diagnostics.sampleRejectedPackages.length >= 8) return;
  diagnostics.sampleRejectedPackages.push(sample);
};

const pushMatchedPackageSample = (
  diagnostics: PackageDiagnosticsSummary,
  sample: PackageDiagnosticsSummary["sampleMatchedPackages"][number],
) => {
  if (diagnostics.sampleMatchedPackages.length >= 8) return;
  diagnostics.sampleMatchedPackages.push(sample);
};

export function evaluatePackageScenarios(params: {
  packages: WithId<RecommendationPackage>[];
  productsById: Map<string, WithId<Product>>;
  input: RecommendationInput;
  minMatchPercent?: number;
  askedKeys?: string[];
  questionnaireKeys?: string[];
  debug?: boolean;
}): PackageEvaluationResult {
  const threshold = Number.isFinite(params.minMatchPercent) ? (params.minMatchPercent as number) : 65;
  const preferenceKeys = getPreferenceKeys(params.input.preferences);
  const askedKeySet = params.askedKeys?.length ? new Set(params.askedKeys) : undefined;
  const questionnaireKeySet = params.questionnaireKeys?.length ? new Set(params.questionnaireKeys) : undefined;

  const diagnostics = createPackageDiagnosticsSummary();
  const matches: PackageMatch[] = [];

  params.packages.forEach((pkg) => {
    diagnostics.packageCounts.total += 1;

    if (!pkg.active) return;

    const items = pkg.items ?? [];
    const activeScenarios = (pkg.recommendationScenarios ?? []).filter((scenario) => scenario.active);
    const activeScenarioCount = activeScenarios.length;

    if (!isPackageShapeEligible(pkg)) {
      diagnostics.packageCounts.invalidShape += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: "invalid_shape",
        activeScenarioCount,
      });
      return;
    }

    const missingProductIds = items
      .map((item) => item.productId)
      .filter((productId) => !params.productsById.has(productId));
    if (missingProductIds.length > 0) {
      diagnostics.packageCounts.missingProducts += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: "missing_products",
        activeScenarioCount,
        missingProductIds,
      });
      return;
    }

    const packageProducts = getPackageProducts(pkg, params.productsById);
    if (!packageProducts.length) {
      diagnostics.packageCounts.missingProducts += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: "missing_products",
        activeScenarioCount,
      });
      return;
    }

    const packageCurrencies = [...new Set(packageProducts.map((product) => product.currency))];
    if (packageCurrencies.length !== 1) {
      diagnostics.packageCounts.mixedCurrency += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: "mixed_currency",
        activeScenarioCount,
        currencies: packageCurrencies,
      });
      return;
    }

    const computedTotalPrice = Number(
      packageProducts.reduce((sum, product) => sum + Number(product.price ?? 0), 0).toFixed(2),
    );
    const totalPrice = Number.isFinite(pkg.totalPrice) ? Number(pkg.totalPrice) : computedTotalPrice;

    if (activeScenarios.length === 0) {
      diagnostics.packageCounts.noActiveScenarios += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: "no_active_scenarios",
        activeScenarioCount,
        totalPrice,
      });
      return;
    }

    let matchedForPackage = false;
    let bestRejectedReason:
      | "below_threshold"
      | "budget_below_min"
      | "budget_above_max"
      | "nan_match_percent"
      | undefined;
    let bestRejectedMatchPercent = -1;
    let bestRejectedScenarioOrder: number | undefined;

    activeScenarios.forEach((scenario) => {
      const { isBudgetOk, matchPercent, debug } = calculateMatchPercent(
        scenario,
        params.input,
        totalPrice,
        askedKeySet,
        questionnaireKeySet,
        params.debug,
        threshold,
      );

      if (!isBudgetOk) {
        if (debug?.budget.reason === "below_min") diagnostics.scenarioOutcomeCounts.budgetBelowMin += 1;
        else diagnostics.scenarioOutcomeCounts.budgetAboveMax += 1;

        if (bestRejectedReason === undefined) {
          bestRejectedReason = debug?.budget.reason === "below_min" ? "budget_below_min" : "budget_above_max";
          bestRejectedScenarioOrder = scenario.order;
        }
        return;
      }

      if (Number.isNaN(matchPercent)) {
        diagnostics.scenarioOutcomeCounts.nanMatchPercent += 1;
        if (bestRejectedReason === undefined) {
          bestRejectedReason = "nan_match_percent";
          bestRejectedScenarioOrder = scenario.order;
        }
        return;
      }

      if (matchPercent < threshold) {
        diagnostics.scenarioOutcomeCounts.belowThreshold += 1;
        if (matchPercent > bestRejectedMatchPercent) {
          bestRejectedMatchPercent = matchPercent;
          bestRejectedReason = "below_threshold";
          bestRejectedScenarioOrder = scenario.order;
        }
        return;
      }

      diagnostics.scenarioOutcomeCounts.matched += 1;
      matchedForPackage = true;
      matches.push({
        package: { ...pkg, totalPrice, currency: packageProducts[0].currency },
        scenario,
        fitScore: calculateFitScore(pkg, packageProducts, preferenceKeys),
        matchPercent,
        matchedPreferences: preferenceKeys,
        ...(debug ? { debug } : {}),
      });
    });

    if (!matchedForPackage) {
      diagnostics.packageCounts.rejectedByScenarios += 1;
      pushRejectedPackageSample(diagnostics, {
        packageId: pkg.id,
        title: pkg.title,
        mode: pkg.mode,
        reason: bestRejectedReason ?? "below_threshold",
        activeScenarioCount,
        ...(bestRejectedMatchPercent >= 0 ? { bestMatchPercent: bestRejectedMatchPercent } : {}),
        ...(bestRejectedScenarioOrder !== undefined ? { bestScenarioOrder: bestRejectedScenarioOrder } : {}),
        totalPrice,
      });
    }
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
    if (best) {
      diagnostics.packageCounts.matched += 1;
      pushMatchedPackageSample(diagnostics, {
        packageId: best.package.id,
        title: best.package.title,
        matchPercent: best.matchPercent,
        scenarioOrder: best.scenario.order,
        totalPrice: best.package.totalPrice,
      });
      bestMatches.push(best);
    }
  });

  return {
    matches: bestMatches.sort(sortMatches),
    diagnostics,
  };
}

export function matchPackageScenarios(params: {
  packages: WithId<RecommendationPackage>[];
  productsById: Map<string, WithId<Product>>;
  input: RecommendationInput;
  minMatchPercent?: number;
  askedKeys?: string[];
  questionnaireKeys?: string[];
  debug?: boolean;
}): PackageMatch[] {
  return evaluatePackageScenarios(params).matches;
}
