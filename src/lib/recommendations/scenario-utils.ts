import type {
  ProductRecommendationScenario,
  QuestionnaireQuestion,
  QuestionnaireQuestionOption,
  WithId,
} from "@/lib/firestore/types";
import type { VocabularyCategory } from "@/lib/firestore/vocabulary";

export type ScenarioDraft = {
  id: string;
  active: boolean;
  order: number;
  explanationTemplate: string;
  conditions: Record<string, string[]>;
  questionnaireBinding?: {
    questionnaireId: string;
    questionnaireTitleSnapshot: string;
  };
};

export type QuestionnaireScenarioWarning = {
  type: "duplicate_key" | "missing_key" | "missing_option";
  key: string;
  message: string;
};

export type QuestionnaireScenarioAnalysis = {
  eligibleQuestions: Array<WithId<QuestionnaireQuestion>>;
  duplicateKeys: string[];
  selectionsByQuestionId: Record<string, string[]>;
  warnings: QuestionnaireScenarioWarning[];
};

const normalizeConditionValues = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
};

export const buildConditionMap = (keys: string[], source: ProductRecommendationScenario["conditions"] | undefined) => {
  const result: Record<string, string[]> = {};
  keys.forEach((key) => {
    result[key] = normalizeConditionValues(source?.[key]);
  });
  if (source) {
    Object.entries(source).forEach(([key, value]) => {
      if (key in result) return;
      const normalized = normalizeConditionValues(value);
      if (normalized.length) result[key] = normalized;
    });
  }
  return result;
};

export const serializeScenarioDraft = (scenario: ScenarioDraft): ProductRecommendationScenario => ({
  active: Boolean(scenario.active),
  order: Number(scenario.order ?? 0),
  explanationTemplate: scenario.explanationTemplate.trim(),
  ...(scenario.questionnaireBinding?.questionnaireId
    ? {
        questionnaireBinding: {
          questionnaireId: scenario.questionnaireBinding.questionnaireId.trim(),
          questionnaireTitleSnapshot: String(scenario.questionnaireBinding.questionnaireTitleSnapshot ?? "").trim(),
        },
      }
    : {}),
  conditions: Object.fromEntries(
    Object.entries(scenario.conditions).filter(([, values]) => Array.isArray(values) && values.length > 0),
  ),
});

export const appendRecommendationScenarios = (
  existing: ProductRecommendationScenario[] | undefined,
  incoming: ProductRecommendationScenario[],
) => {
  const base = existing ? [...existing] : [];
  const maxOrder = base.length ? Math.max(...base.map((scenario) => Number(scenario.order ?? 0))) : -1;
  const appended = incoming.map((scenario, index) => ({
    ...scenario,
    order: maxOrder + index + 1,
  }));
  return [...base, ...appended];
};

export const toScenarioDraft = (
  source: ProductRecommendationScenario,
  vocabularyKeys: string[],
  id: string,
): ScenarioDraft => ({
  id,
  active: Boolean(source.active),
  order: Number(source.order ?? 0),
  explanationTemplate: source.explanationTemplate ?? "",
  questionnaireBinding: source.questionnaireBinding?.questionnaireId
    ? {
        questionnaireId: source.questionnaireBinding.questionnaireId.trim(),
        questionnaireTitleSnapshot: String(source.questionnaireBinding.questionnaireTitleSnapshot ?? "").trim(),
      }
    : undefined,
  conditions: buildConditionMap(vocabularyKeys, source.conditions),
});

export const createLegacyScenarioDraft = (id: string, order: number, vocabularyKeys: string[]): ScenarioDraft => ({
  id,
  active: true,
  order,
  explanationTemplate: "",
  conditions: buildConditionMap(vocabularyKeys, {}),
});

export const createQuestionnaireScenarioDraft = (params: {
  id: string;
  order: number;
  questionnaireId: string;
  questionnaireTitleSnapshot: string;
}): ScenarioDraft => ({
  id: params.id,
  active: true,
  order: params.order,
  explanationTemplate: "",
  questionnaireBinding: {
    questionnaireId: params.questionnaireId,
    questionnaireTitleSnapshot: params.questionnaireTitleSnapshot,
  },
  conditions: {},
});

export const formatScenarioSummary = (
  scenario: ScenarioDraft,
  categories: Array<Pick<VocabularyCategory, "key" | "title">>,
) => {
  if (scenario.questionnaireBinding?.questionnaireId) {
    const keysCount = Object.values(scenario.conditions).filter((values) => values.length > 0).length;
    const parts = [
      `Chestionar: ${scenario.questionnaireBinding.questionnaireTitleSnapshot || "Necunoscut"}`,
      keysCount === 1 ? "1 întrebare" : `${keysCount} întrebări`,
    ];
    if (scenario.explanationTemplate.trim()) parts.push("Are explicație");
    return parts.join(" • ");
  }

  const parts: string[] = [];
  const knownKeys = new Set(categories.map((category) => category.key));
  categories.forEach((category) => {
    const values = scenario.conditions[category.key] ?? [];
    if (values.length) parts.push(`${category.title}: ${values.length}`);
  });
  Object.entries(scenario.conditions).forEach(([key, values]) => {
    if (knownKeys.has(key)) return;
    if (values.length) parts.push(`${key}: ${values.length}`);
  });
  if (scenario.explanationTemplate.trim()) parts.push("Are explicație");
  return parts.length ? parts.join(" • ") : "Fără condiții setate";
};

const getEligibleQuestions = (questions: Array<WithId<QuestionnaireQuestion>>) =>
  questions.filter(
    (question) =>
      question.active &&
      (question.type === "single_select" || question.type === "multi_select") &&
      Boolean(question.key?.trim()),
  );

const getActiveOptions = (options: QuestionnaireQuestionOption[] | undefined) =>
  (options ?? []).filter((option) => option.active);

export const analyzeQuestionnaireScenario = (
  scenario: Pick<ScenarioDraft, "conditions">,
  questions: Array<WithId<QuestionnaireQuestion>>,
): QuestionnaireScenarioAnalysis => {
  const eligible = getEligibleQuestions(questions);
  const questionsByKey = new Map<string, Array<WithId<QuestionnaireQuestion>>>();
  eligible.forEach((question) => {
    const key = question.key.trim();
    const list = questionsByKey.get(key) ?? [];
    list.push(question);
    questionsByKey.set(key, list);
  });

  const duplicateKeys = [...questionsByKey.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
  const duplicateKeySet = new Set(duplicateKeys);

  const eligibleQuestions = eligible.filter((question) => !duplicateKeySet.has(question.key.trim()));
  const selectionsByQuestionId = Object.fromEntries(
    eligibleQuestions.map((question) => {
      const activeOptionValues = new Set(getActiveOptions(question.options).map((option) => option.value));
      const selected = normalizeConditionValues(scenario.conditions[question.key]).filter((value) =>
        activeOptionValues.has(value),
      );
      return [question.id, selected];
    }),
  );

  const warnings: QuestionnaireScenarioWarning[] = duplicateKeys.map((key) => ({
    type: "duplicate_key",
    key,
    message: `Cheia „${key}” apare în mai multe întrebări active și nu poate fi editată din acest chestionar.`,
  }));

  Object.entries(scenario.conditions).forEach(([key, rawValues]) => {
    const values = normalizeConditionValues(rawValues);
    if (!values.length) return;
    const matchingQuestions = questionsByKey.get(key) ?? [];
    if (matchingQuestions.length === 0) {
      warnings.push({
        type: "missing_key",
        key,
        message: `Cheia „${key}” nu mai există printre întrebările active eligibile ale chestionarului.`,
      });
      return;
    }
    if (matchingQuestions.length > 1) return;

    const question = matchingQuestions[0];
    const activeOptionValues = new Set(getActiveOptions(question.options).map((option) => option.value));
    const missingValues = values.filter((value) => !activeOptionValues.has(value));
    if (!missingValues.length) return;
    warnings.push({
      type: "missing_option",
      key,
      message: `Întrebarea „${question.label}” nu mai conține toate opțiunile salvate pentru cheia „${key}”.`,
    });
  });

  return {
    eligibleQuestions,
    duplicateKeys,
    selectionsByQuestionId,
    warnings,
  };
};

export const updateScenarioQuestionSelection = (
  scenario: ScenarioDraft,
  question: Pick<WithId<QuestionnaireQuestion>, "key">,
  optionValues: string[],
): ScenarioDraft => {
  const nextValues = normalizeConditionValues(optionValues);
  const nextConditions = { ...scenario.conditions };
  if (nextValues.length === 0) delete nextConditions[question.key];
  else nextConditions[question.key] = nextValues;
  return { ...scenario, conditions: nextConditions };
};
