import assert from "node:assert/strict";
import test from "node:test";
import { apiCost, modelLabel, modelRates, parseModelId } from "../shared/models";

test("parseModelId reads current, dated and legacy ids", () => {
  assert.deepEqual(parseModelId("claude-opus-4-1-20250805"), { family: "opus", major: 4, minor: 1 });
  assert.deepEqual(parseModelId("claude-opus-4-20250514"), { family: "opus", major: 4, minor: null });
  assert.deepEqual(parseModelId("claude-sonnet-5"), { family: "sonnet", major: 5, minor: null });
  assert.deepEqual(parseModelId("claude-opus-5-5[1m]"), { family: "opus", major: 5, minor: 5 });
  assert.deepEqual(parseModelId("claude-3-5-haiku-20241022"), { family: "haiku", major: 3, minor: 5 });
  assert.deepEqual(parseModelId("claude-mythos-5-1"), { family: "fable", major: 5, minor: 1 });
  assert.deepEqual(parseModelId("gpt-something"), { family: "other", major: null, minor: null });
});

test("modelLabel gives a short display name", () => {
  assert.equal(modelLabel("claude-opus-4-1-20250805"), "Opus 4.1");
  assert.equal(modelLabel("claude-fable-5-1"), "Fable 5.1");
  assert.equal(modelLabel("claude-mythos-5"), "Mythos 5");
  assert.equal(modelLabel("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(modelLabel("custom-model"), "custom-model");
});

test("modelRates follows each generation's API price", () => {
  assert.deepEqual(modelRates("claude-opus-4-1-20250805"), { input: 15, output: 75, cacheRead: 1.5 });
  assert.deepEqual(modelRates("claude-opus-4-5-20251101"), { input: 5, output: 25, cacheRead: 0.5 });
  assert.deepEqual(modelRates("claude-opus-5-5"), { input: 4, output: 20, cacheRead: 0.4 });
  assert.deepEqual(modelRates("claude-sonnet-4-5-20250929"), { input: 3, output: 15, cacheRead: 0.3 });
  assert.deepEqual(modelRates("claude-sonnet-5"), { input: 2, output: 10, cacheRead: 0.2 });
  assert.deepEqual(modelRates("claude-haiku-4-5-20251001"), { input: 1, output: 5, cacheRead: 0.1 });
  assert.equal(modelRates("claude-fable-5-1").cacheRead, 0.25);
  assert.equal(modelRates("claude-fable-5").cacheRead, 1);
});

test("apiCost weights cache writes by TTL and cache reads at their own rate", () => {
  const cost = apiCost("claude-sonnet-4-5", { input: 1_000_000, output: 1_000_000, cacheWrite5m: 1_000_000, cacheWrite1h: 1_000_000, cacheRead: 1_000_000 });
  assert.ok(Math.abs(cost - (3 + 15 + 3.75 + 6 + 0.3)) < 1e-9);
  const opus = apiCost("claude-opus-4-1", { input: 0, output: 1000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });
  const haiku = apiCost("claude-haiku-4-5", { input: 0, output: 1000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 });
  assert.equal(opus / haiku, 15);
});
