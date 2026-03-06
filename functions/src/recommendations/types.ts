export type WithId<T> = T & { id: string };

export type QuestionnaireQuestionVisibilityRule = {
  questionId: string;
  optionValues: string[];
};

export type QuestionnaireQuestion = {
  id: string;
  active: boolean;
  order: number;
  type: "single_select" | "multi_select" | "text" | "range";
  key: string;
  label: string;
  helpText?: string;
  options?: Array<{
    value: string;
    label: string;
    order: number;
    active: boolean;
  }>;
  visibilityRules?: QuestionnaireQuestionVisibilityRule[];
  validation?: {
    required: boolean;
    min?: number;
    max?: number;
  };
};

export type ProductRecommendationScenario = {
  active: boolean;
  order: number;
  questionnaireBinding?: {
    questionnaireId: string;
    questionnaireTitleSnapshot: string;
  };
  conditions: {
    budgetMin?: number;
    budgetMax?: number;
    [key: string]: string[] | number | undefined;
  };
  explanationTemplate: string;
};

export type Product = {
  active: boolean;
  name: string;
  brand?: string;
  imageUrls?: string[];
  imageUrl?: string;
  productUrl?: string;
  price: number;
  currency: "EUR" | "RON";
  tags: {
    level: string[];
    style: string[];
    distance: string[];
  };
  attributes: { control?: number; spin?: number; speed?: number; weight?: number };
  source?: { provider: "prestashop"; prestashopProductId: string };
  recommendationScenarios?: ProductRecommendationScenario[];
};

export type PackageMode = "single" | "triple" | "custom";
export type PackageItemRole = "single" | "blade" | "forehand" | "backhand";

export type RecommendationPackageItem = {
  role?: PackageItemRole;
  productId: string;
};

export type RecommendationPackage = {
  active: boolean;
  title: string;
  description?: string;
  mode: PackageMode;
  items: RecommendationPackageItem[];
  attributes?: { control?: number; spin?: number; speed?: number };
  totalPrice: number;
  currency: "EUR" | "RON";
  recommendationScenarios?: ProductRecommendationScenario[];
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
    status: "matched" | "unanswered" | "not_counted" | "missing_in_questionnaire";
  }>;
};

export type ProductMatch = {
  product: WithId<Product>;
  scenario: ProductRecommendationScenario;
  fitScore: number;
  matchPercent: number;
  matchedPreferences: string[];
  debug?: ProductMatchDebug;
};

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

export type RecommendationSkippedQuestion = {
  questionId: string;
  reason: "rule_not_met" | "inactive" | "prerequisite_not_answered";
};

export type ComputeRecommendationsRequest = {
  questionnaireId: string;
  answers: Record<string, unknown>;
  debug?: boolean;
};

export type ProductLite = {
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

export type PackageLite = {
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
  productMatches: Array<{
    product: ProductLite;
    scenario: ProductRecommendationScenario;
    fitScore: number;
    matchPercent: number;
    matchedPreferences: string[];
    debug?: ProductMatch["debug"];
  }>;
  packageMatches: Array<{
    package: PackageLite;
    scenario: ProductRecommendationScenario;
    fitScore: number;
    matchPercent: number;
    matchedPreferences: string[];
    debug?: PackageMatch["debug"];
  }>;
};
