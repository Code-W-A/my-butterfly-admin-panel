import type {
  QuestionnaireQuestion,
  QuestionnaireQuestionVisibilityRule,
  RecommendationInput,
  RecommendationSkippedQuestion,
} from "./types";

type AnswerMap = Record<string, unknown>;
type RangeAnswer = { min?: string; max?: string };

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  const single = asTrimmedString(value);
  return single ? [single] : [];
};

export const asSingleChoice = (value: unknown) => {
  const values = asStringArray(value);
  return values[0];
};

const parseRangeAnswer = (value: unknown) => {
  if (!value || typeof value !== "object") return { min: undefined, max: undefined };
  const range = value as RangeAnswer;
  return {
    min: asNumber(range.min),
    max: asNumber(range.max),
  };
};

const parsePreferences = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const buildRecommendationInput = (
  questions: QuestionnaireQuestion[],
  answers: AnswerMap,
): { input: RecommendationInput; preferences: string[] } => {
  const getAnswerByKey = (key: QuestionnaireQuestion["key"]) => {
    const question = questions.find((item) => item.active && item.key === key);
    return question ? answers[question.id] : undefined;
  };

  const selectionsByKey = questions.reduce<Record<string, string[]>>((acc, question) => {
    if (!question.active) return acc;
    const answer = answers[question.id];
    if (question.type === "single_select") {
      const selected = asSingleChoice(answer);
      if (selected) acc[question.key] = [selected];
      return acc;
    }
    if (question.type === "multi_select") {
      const selected = asStringArray(answer);
      if (selected.length) acc[question.key] = selected;
    }
    return acc;
  }, {});

  const level = asSingleChoice(getAnswerByKey("level"));
  const style = asSingleChoice(getAnswerByKey("style"));
  const distance = asSingleChoice(getAnswerByKey("distance"));
  const priority = asSingleChoice(getAnswerByKey("priority"));

  const budgetAnswer = getAnswerByKey("budget");
  const budgetNumber = asNumber(budgetAnswer);
  const budgetRange = parseRangeAnswer(budgetAnswer);

  const preferencesAnswer = getAnswerByKey("preferences");
  const preferences = Array.isArray(preferencesAnswer)
    ? asStringArray(preferencesAnswer)
    : typeof preferencesAnswer === "string"
      ? parsePreferences(preferencesAnswer)
      : [];

  const input: RecommendationInput = {
    level,
    style,
    distance,
    priority,
    budget: budgetNumber,
    budgetMin: budgetRange.min,
    budgetMax: budgetRange.max,
    preferences: preferences.length ? preferences : undefined,
    selectionsByKey: Object.keys(selectionsByKey).length ? selectionsByKey : undefined,
  };

  return { input, preferences };
};

export const isRuleSatisfied = (
  rule: QuestionnaireQuestionVisibilityRule,
  answers: AnswerMap,
  questionsById: Record<string, QuestionnaireQuestion>,
) => {
  const source = questionsById[rule.questionId];
  if (!source || !rule.optionValues.length) return false;
  const answer = answers[rule.questionId];
  if (source.type === "single_select") {
    const selected = asSingleChoice(answer);
    return Boolean(selected && rule.optionValues.includes(selected));
  }
  if (source.type === "multi_select") {
    const selected = asStringArray(answer);
    return selected.some((value) => rule.optionValues.includes(value));
  }
  return false;
};

export const getOrderedQuestions = (questions: QuestionnaireQuestion[], answers: AnswerMap) => {
  const questionsById = Object.fromEntries(questions.map((question) => [question.id, question])) as Record<
    string,
    QuestionnaireQuestion
  >;
  return questions
    .filter((item) => item.active)
    .sort((a, b) => a.order - b.order)
    .filter((question) => {
      const rules = question.visibilityRules ?? [];
      if (!rules.length) return true;
      return rules.every((rule) => isRuleSatisfied(rule, answers, questionsById));
    });
};

const isMissingAnswer = (value: unknown) => {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "object") {
    const range = value as { min?: string; max?: string };
    return !(range.min?.toString().trim() && range.max?.toString().trim());
  }
  return false;
};

export const computeSkippedQuestions = (
  questions: QuestionnaireQuestion[],
  orderedQuestions: QuestionnaireQuestion[],
  answers: AnswerMap,
): RecommendationSkippedQuestion[] => {
  const questionsById = Object.fromEntries(questions.map((question) => [question.id, question])) as Record<
    string,
    QuestionnaireQuestion
  >;
  const askedIds = new Set(orderedQuestions.map((question) => question.id));
  return questions
    .filter((question) => !askedIds.has(question.id))
    .map((question) => {
      const rules = question.visibilityRules ?? [];
      if (!question.active) {
        return { questionId: question.id, reason: "inactive" as const };
      }
      if (rules.length > 0 && !rules.every((rule) => isRuleSatisfied(rule, answers, questionsById))) {
        const hasMissingPrereq = rules.some((rule) => isMissingAnswer(answers[rule.questionId]));
        return {
          questionId: question.id,
          reason: hasMissingPrereq ? ("prerequisite_not_answered" as const) : ("rule_not_met" as const),
        };
      }
      return { questionId: question.id, reason: "rule_not_met" as const };
    });
};
