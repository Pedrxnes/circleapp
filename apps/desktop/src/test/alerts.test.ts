import assert from "node:assert/strict";
import test from "node:test";
import { ThresholdAlerts } from "../main/alerts";
import type { Usage } from "../shared/types";

function usageAt(session: number, week = 0): Usage {
  return {
    state: "ok",
    windows: [{ key: "session", percent: session, resetsAt: null }, { key: "week", percent: week, resetsAt: null }],
    accountEmail: null,
    updatedAt: null,
    error: null,
    sourceLabel: null
  };
}

test("a threshold notifies once, not on every refresh", () => {
  const alerts = new ThresholdAlerts();
  assert.equal(alerts.evaluate(usageAt(80), [75, 90]).length, 1);
  assert.equal(alerts.evaluate(usageAt(82), [75, 90]).length, 0);
  assert.equal(alerts.evaluate(usageAt(88), [75, 90]).length, 0);
});

test("crossing the next threshold notifies again", () => {
  const alerts = new ThresholdAlerts();
  alerts.evaluate(usageAt(80), [75, 90]);
  const second = alerts.evaluate(usageAt(93), [75, 90]);
  assert.equal(second.length, 1);
  assert.equal(second[0]?.threshold, 90);
});

test("dropping back below rearms the threshold", () => {
  const alerts = new ThresholdAlerts();
  alerts.evaluate(usageAt(80), [75, 90]);
  assert.equal(alerts.evaluate(usageAt(10), [75, 90]).length, 0);
  assert.equal(alerts.evaluate(usageAt(80), [75, 90]).length, 1);
});

test("each window is tracked on its own", () => {
  const alerts = new ThresholdAlerts();
  const first = alerts.evaluate(usageAt(80, 80), [75]);
  assert.deepEqual(first.map((alert) => alert.key), ["session", "week"]);
});

test("failed readings never notify", () => {
  const alerts = new ThresholdAlerts();
  const failed: Usage = { state: "error", windows: [], accountEmail: null, updatedAt: null, error: "boom", sourceLabel: null };
  assert.equal(alerts.evaluate(failed, [75]).length, 0);
});
