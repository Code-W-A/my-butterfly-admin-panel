import { HttpsError } from "firebase-functions/v2/https";

import { ensureAuthenticated, parseComputeRecommendationsRequest } from "../compute";
import assert from "node:assert/strict";
import test from "node:test";

test("throws unauthenticated when auth is missing", () => {
  assert.throws(
    () => ensureAuthenticated(undefined),
    (err: unknown) => err instanceof HttpsError && err.code === "unauthenticated",
  );
});

test("throws invalid-argument for malformed payload", () => {
  assert.throws(
    () => parseComputeRecommendationsRequest({ answers: {} }),
    (err: unknown) => err instanceof HttpsError && err.code === "invalid-argument",
  );
});

test("accepts valid payload and result is serializable", () => {
  const parsed = parseComputeRecommendationsRequest({
    questionnaireId: "q-1",
    answers: { a: "x" },
    debug: true,
  });
  assert.equal(parsed.questionnaireId, "q-1");
  assert.deepEqual(parsed.answers, { a: "x" });
  assert.equal(parsed.debug, true);
  assert.doesNotThrow(() => JSON.stringify(parsed));
});
