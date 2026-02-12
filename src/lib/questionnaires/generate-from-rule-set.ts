import type {
  ProductRecommendationScenario,
  QuestionnaireQuestion,
  QuestionnaireQuestionOption,
  RecommendationRuleSet,
} from "@/lib/firestore/types";
import type { VocabularyCategory } from "@/lib/firestore/vocabulary";

type GeneratedQuestionDraft = Omit<QuestionnaireQuestion, "createdAt" | "updatedAt">;

type GenerateQuestionsFromRuleSetParams = {
  ruleSet: RecommendationRuleSet;
  vocabularyKeys: VocabularyCategory[];
  getVocabularyOptionsByKey: (key: string) => Promise<QuestionnaireQuestionOption[]>;
};

type GenerateQuestionsFromRuleSetResult = {
  questions: GeneratedQuestionDraft[];
};

const getRuleScenario = (ruleSet: RecommendationRuleSet): ProductRecommendationScenario | null =>
  ruleSet.scenario ?? ruleSet.scenarios?.[0] ?? null;

const normalizeConditionValues = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const humanizeOptionLabel = (value: string) => {
  const clean = value.trim().replace(/[_-]+/g, " ");
  if (!clean) return value;
  return `${clean.slice(0, 1).toUpperCase()}${clean.slice(1)}`;
};

const buildFallbackOptions = (values: string[]) => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  values.forEach((value) => {
    if (seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  });
  return ordered.map((value, index) => ({
    value,
    label: humanizeOptionLabel(value),
    order: index,
    active: true,
  }));
};

const buildQuestionLabel = (key: string, category?: VocabularyCategory) => {
  const standard = category?.standardQuestion?.trim();
  if (standard) return standard;
  if (category?.title?.trim()) return `Care este ${category.title.trim().toLowerCase()}?`;
  if (key === "budget") return "Care este bugetul tău?";
  return `Selectează valoarea pentru ${key}`;
};

export async function generateQuestionsFromRuleSet(
  params: GenerateQuestionsFromRuleSetParams,
): Promise<GenerateQuestionsFromRuleSetResult> {
  const scenario = getRuleScenario(params.ruleSet);
  if (!scenario) return { questions: [] };

  const conditions = scenario.conditions ?? {};
  const valuesByKey = new Map<string, string[]>();
  const keyAppearanceOrder: string[] = [];

  Object.entries(conditions).forEach(([key, rawValue]) => {
    if (key === "budgetMin" || key === "budgetMax") return;
    const values = normalizeConditionValues(rawValue);
    if (values.length === 0) return;
    valuesByKey.set(key, values);
    keyAppearanceOrder.push(key);
  });

  const hasBudgetBounds =
    normalizeNumber(conditions.budgetMin) !== undefined || normalizeNumber(conditions.budgetMax) !== undefined;

  const sortedVocabularyKeys = params.vocabularyKeys
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => category.key);

  const categoriesByKey = new Map(params.vocabularyKeys.map((category) => [category.key, category] as const));
  const knownKeys = sortedVocabularyKeys.filter((key) => valuesByKey.has(key));
  const unknownKeys = keyAppearanceOrder.filter((key) => !categoriesByKey.has(key));
  const orderedKeys = [...knownKeys, ...unknownKeys];

  const questions: GeneratedQuestionDraft[] = [];

  for (const key of orderedKeys) {
    const category = categoriesByKey.get(key);
    if (key === "budget") {
      questions.push({
        active: true,
        order: questions.length,
        type: "range",
        key,
        label: buildQuestionLabel(key, category),
        validation: { required: false },
      });
      continue;
    }

    const fallbackValues = valuesByKey.get(key) ?? [];
    let options: QuestionnaireQuestionOption[] = [];
    if (categoriesByKey.has(key)) {
      options = (await params.getVocabularyOptionsByKey(key))
        .filter((option) => option.active)
        .map((option, index) => ({
          value: option.value,
          label: option.label,
          order: Number.isFinite(option.order) ? option.order : index,
          active: option.active,
        }));
    }
    if (options.length === 0) {
      options = buildFallbackOptions(fallbackValues);
    }

    questions.push({
      active: true,
      order: questions.length,
      type: key === "preferences" ? "multi_select" : "single_select",
      key,
      label: buildQuestionLabel(key, category),
      options,
      validation: { required: false },
    });
  }

  if (hasBudgetBounds && !orderedKeys.includes("budget")) {
    const budgetCategory = categoriesByKey.get("budget");
    questions.push({
      active: true,
      order: questions.length,
      type: "range",
      key: "budget",
      label: buildQuestionLabel("budget", budgetCategory),
      validation: { required: false },
    });
  }

  return { questions };
}
