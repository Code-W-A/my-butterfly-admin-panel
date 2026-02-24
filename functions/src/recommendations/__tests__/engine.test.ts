import { resolveResultMode } from "../compute";
import { matchProductScenarios } from "../match";
import { matchPackageScenarios } from "../match-packages";
import type { Product, RecommendationPackage, WithId } from "../types";
import assert from "node:assert/strict";
import test from "node:test";

const makeProduct = (id: string, price: number, scenarios: Product["recommendationScenarios"]): WithId<Product> => ({
  id,
  active: true,
  name: `Produs ${id}`,
  price,
  currency: "RON",
  tags: { level: [], style: [], distance: [] },
  attributes: { speed: 5, spin: 5, control: 5 },
  recommendationScenarios: scenarios,
});

test("excludes product when price is below budget min", () => {
  const products = [makeProduct("p1", 100, [{ active: true, order: 0, explanationTemplate: "", conditions: {} }])];
  const result = matchProductScenarios({
    products,
    input: { budgetMin: 150 },
    minMatchPercent: 0,
  });
  assert.equal(result.length, 0);
});

test("excludes product when price is above budget max", () => {
  const products = [makeProduct("p1", 300, [{ active: true, order: 0, explanationTemplate: "", conditions: {} }])];
  const result = matchProductScenarios({
    products,
    input: { budgetMax: 150 },
    minMatchPercent: 0,
  });
  assert.equal(result.length, 0);
});

test("unasked conditional keys are not counted in match percent", () => {
  const products = [
    makeProduct("p1", 100, [
      {
        active: true,
        order: 0,
        explanationTemplate: "",
        conditions: { style: ["offensive"] },
      },
    ]),
  ];
  const result = matchProductScenarios({
    products,
    input: {},
    minMatchPercent: 0,
    askedKeys: ["level"],
    questionnaireKeys: ["level", "style"],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].matchPercent, 100);
});

test("missing questionnaire key is counted and marked in debug", () => {
  const products = [
    makeProduct("p1", 100, [
      {
        active: true,
        order: 0,
        explanationTemplate: "",
        conditions: { unknown_key: ["x"] },
      },
    ]),
  ];
  const result = matchProductScenarios({
    products,
    input: {},
    minMatchPercent: 0,
    askedKeys: ["level"],
    questionnaireKeys: ["level"],
    debug: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].matchPercent, 0);
  assert.equal(result[0].debug?.conditions[0]?.status, "missing_in_questionnaire");
});

test("keeps only best scenario per product", () => {
  const products = [
    makeProduct("p1", 100, [
      {
        active: true,
        order: 0,
        explanationTemplate: "good",
        conditions: { level: ["beginner"] },
      },
      {
        active: true,
        order: 1,
        explanationTemplate: "bad",
        conditions: { level: ["advanced"] },
      },
    ]),
  ];
  const result = matchProductScenarios({
    products,
    input: { level: "beginner" },
    minMatchPercent: 0,
    askedKeys: ["level"],
    questionnaireKeys: ["level"],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].scenario.explanationTemplate, "good");
  assert.equal(result[0].matchPercent, 100);
});

test("invalid package shape is excluded", () => {
  const products = [makeProduct("p1", 100, []), makeProduct("p2", 100, [])];
  const productsById = new Map(products.map((item) => [item.id, item]));
  const invalidPackage: WithId<RecommendationPackage> = {
    id: "pkg1",
    active: true,
    title: "invalid",
    mode: "single",
    items: [
      { role: "single", productId: "p1" },
      { role: "single", productId: "p2" },
    ],
    totalPrice: 200,
    currency: "RON",
    recommendationScenarios: [{ active: true, order: 0, explanationTemplate: "", conditions: {} }],
  };
  const result = matchPackageScenarios({
    packages: [invalidPackage],
    productsById,
    input: {},
    minMatchPercent: 0,
  });
  assert.equal(result.length, 0);
});

test("keeps only best scenario per package", () => {
  const products = [makeProduct("p1", 100, [])];
  const productsById = new Map(products.map((item) => [item.id, item]));
  const pkg: WithId<RecommendationPackage> = {
    id: "pkg1",
    active: true,
    title: "pkg",
    mode: "single",
    items: [{ role: "single", productId: "p1" }],
    totalPrice: 100,
    currency: "RON",
    recommendationScenarios: [
      { active: true, order: 0, explanationTemplate: "good", conditions: { level: ["beginner"] } },
      { active: true, order: 1, explanationTemplate: "bad", conditions: { level: ["advanced"] } },
    ],
  };
  const result = matchPackageScenarios({
    packages: [pkg],
    productsById,
    input: { level: "beginner" },
    minMatchPercent: 0,
    askedKeys: ["level"],
    questionnaireKeys: ["level"],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].scenario.explanationTemplate, "good");
});

test("package fitScore uses blade product when available", () => {
  const blade: WithId<Product> = makeProduct("blade", 100, []);
  blade.attributes = { speed: 9 };
  blade.name = "Blade";

  const fh = makeProduct("fh", 80, []);
  fh.attributes = { speed: 1 };
  const bh = makeProduct("bh", 70, []);
  bh.attributes = { speed: 1 };

  const productsById = new Map([blade, fh, bh].map((item) => [item.id, item]));

  const pkg: WithId<RecommendationPackage> = {
    id: "pkg-blade",
    active: true,
    title: "triple",
    mode: "triple",
    items: [
      { role: "blade", productId: blade.id },
      { role: "rubber_fh", productId: fh.id },
      { role: "rubber_bh", productId: bh.id },
    ],
    totalPrice: 250,
    currency: "RON",
    recommendationScenarios: [{ active: true, order: 0, explanationTemplate: "", conditions: {} }],
  };

  const result = matchPackageScenarios({
    packages: [pkg],
    productsById,
    input: { preferences: ["speed"] },
    minMatchPercent: 0,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].fitScore, 9);
});

test("resolveResultMode returns packages when package matches exist", () => {
  assert.equal(resolveResultMode(2), "packages");
  assert.equal(resolveResultMode(0), "products");
});
