import type { QuestionnaireQuestion, WithId } from "../../firestore/types";
import {
  analyzeQuestionnaireScenario,
  appendRecommendationScenarios,
  type ScenarioDraft,
  serializeScenarioDraft,
  toScenarioDraft,
  updateScenarioQuestionSelection,
} from "../scenario-utils";
import assert from "node:assert/strict";
import test from "node:test";

const makeQuestion = ({
  id,
  key,
  label,
  ...overrides
}: Partial<WithId<QuestionnaireQuestion>> &
  Pick<WithId<QuestionnaireQuestion>, "id" | "key" | "label">): WithId<QuestionnaireQuestion> =>
  ({
    id,
    active: true,
    order: 0,
    type: "single_select",
    key,
    label,
    options: [],
    createdAt: null as never,
    updatedAt: null as never,
    ...overrides,
  }) as WithId<QuestionnaireQuestion>;

test("serializeScenarioDraft preserves questionnaire binding and drops empty conditions", () => {
  const draft: ScenarioDraft = {
    id: "scenario-1",
    active: true,
    order: 3,
    explanationTemplate: "  Motiv  ",
    questionnaireBinding: {
      questionnaireId: "questionnaire-1",
      questionnaireTitleSnapshot: "Chestionar principal",
    },
    conditions: {
      style: ["offensive"],
      empty: [],
    },
  };

  assert.deepEqual(serializeScenarioDraft(draft), {
    active: true,
    order: 3,
    explanationTemplate: "Motiv",
    questionnaireBinding: {
      questionnaireId: "questionnaire-1",
      questionnaireTitleSnapshot: "Chestionar principal",
    },
    conditions: {
      style: ["offensive"],
    },
  });
});

test("toScenarioDraft keeps questionnaire binding and normalizes condition values", () => {
  const draft = toScenarioDraft(
    {
      active: false,
      order: 7,
      explanationTemplate: "Info",
      questionnaireBinding: {
        questionnaireId: "q-2",
        questionnaireTitleSnapshot: "Q2",
      },
      conditions: {
        style: ["offensive"],
        level: ["advanced", ""],
      },
    },
    ["level", "style"],
    "draft-1",
  );

  assert.equal(draft.id, "draft-1");
  assert.equal(draft.active, false);
  assert.deepEqual(draft.questionnaireBinding, {
    questionnaireId: "q-2",
    questionnaireTitleSnapshot: "Q2",
  });
  assert.deepEqual(draft.conditions, {
    level: ["advanced"],
    style: ["offensive"],
  });
});

test("analyzeQuestionnaireScenario reconstructs selections and flags duplicate keys", () => {
  const duplicateA = makeQuestion({
    id: "q-level-a",
    key: "level",
    label: "Nivel A",
    options: [{ value: "beginner", label: "Beginner", order: 0, active: true }],
  });
  const duplicateB = makeQuestion({
    id: "q-level-b",
    key: "level",
    label: "Nivel B",
    options: [{ value: "advanced", label: "Advanced", order: 0, active: true }],
  });
  const style = makeQuestion({
    id: "q-style",
    key: "style",
    label: "Stil",
    type: "multi_select",
    options: [
      { value: "offensive", label: "Ofensiv", order: 0, active: true },
      { value: "defensive", label: "Defensiv", order: 1, active: true },
    ],
  });
  const ignoredText = makeQuestion({
    id: "q-text",
    key: "notes",
    label: "Text",
    type: "text",
  });

  const analysis = analyzeQuestionnaireScenario(
    {
      conditions: {
        level: ["beginner"],
        style: ["defensive"],
      },
    },
    [duplicateA, duplicateB, style, ignoredText],
  );

  assert.deepEqual(
    analysis.eligibleQuestions.map((question) => question.id),
    ["q-style"],
  );
  assert.deepEqual(analysis.duplicateKeys, ["level"]);
  assert.deepEqual(analysis.selectionsByQuestionId, {
    "q-style": ["defensive"],
  });
  assert.equal(analysis.warnings[0]?.type, "duplicate_key");
});

test("analyzeQuestionnaireScenario warns on missing keys and missing options", () => {
  const style = makeQuestion({
    id: "q-style",
    key: "style",
    label: "Stil",
    type: "multi_select",
    options: [{ value: "defensive", label: "Defensiv", order: 0, active: true }],
  });

  const analysis = analyzeQuestionnaireScenario(
    {
      conditions: {
        style: ["defensive", "offensive"],
        distance: ["mid"],
      },
    },
    [style],
  );

  assert.deepEqual(analysis.selectionsByQuestionId, {
    "q-style": ["defensive"],
  });
  assert.deepEqual(analysis.warnings.map((warning) => warning.type).sort(), ["missing_key", "missing_option"]);
});

test("updateScenarioQuestionSelection writes and clears conditions by question key", () => {
  const initial: ScenarioDraft = {
    id: "scenario-2",
    active: true,
    order: 0,
    explanationTemplate: "",
    conditions: {},
  };

  const withValue = updateScenarioQuestionSelection(initial, { key: "style" }, ["offensive"]);
  assert.deepEqual(withValue.conditions, { style: ["offensive"] });

  const cleared = updateScenarioQuestionSelection(withValue, { key: "style" }, []);
  assert.deepEqual(cleared.conditions, {});
});

test("appendRecommendationScenarios appends and rewrites order after existing scenarios", () => {
  const merged = appendRecommendationScenarios(
    [
      {
        active: true,
        order: 2,
        explanationTemplate: "",
        conditions: { style: ["offensive"] },
      },
    ],
    [
      {
        active: true,
        order: 0,
        explanationTemplate: "",
        conditions: { level: ["advanced"] },
      },
      {
        active: false,
        order: 0,
        explanationTemplate: "info",
        conditions: { distance: ["mid"] },
      },
    ],
  );

  assert.deepEqual(
    merged.map((scenario) => scenario.order),
    [2, 3, 4],
  );
  assert.deepEqual(merged[1]?.conditions, { level: ["advanced"] });
  assert.equal(merged[2]?.explanationTemplate, "info");
});
