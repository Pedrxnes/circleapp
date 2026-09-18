import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  HistoryStore,
  burnRatePerHour,
  projectExhaustion,
  prune,
  samplesSinceLastReset,
  sessionPeaks,
  weekConsumption,
  weeklyActivity
} from "../main/history";
import { HISTORY_MAX_SAMPLES } from "../shared/types";

const now = new Date("2026-09-09T12:00:00Z"); // a Wednesday

test("prune drops samples older than the retention window", () => {
  const kept = prune([
    { at: "2026-01-01T12:00:00Z", session: 10, week: 10 },
    { at: "2026-09-08T12:00:00Z", session: 20, week: 30 }
  ], now);
  assert.deepEqual(kept.map((sample) => sample.session), [20]);
});

test("prune clamps stored percentages", () => {
  const kept = prune([{ at: "2026-09-09T11:00:00Z", session: 140, week: -5 }], now);
  assert.deepEqual(kept, [{ at: "2026-09-09T11:00:00Z", session: 100, week: 0 }]);
});

test("prune caps the log so the file cannot grow without bound", () => {
  const samples = Array.from({ length: HISTORY_MAX_SAMPLES + 50 }, (_unused, index) => ({
    at: new Date(now.getTime() - index * 1000).toISOString(),
    session: 1,
    week: 1
  }));
  assert.equal(prune(samples, now).length, HISTORY_MAX_SAMPLES);
});

test("samplesSinceLastReset cuts off before a window rollover", () => {
  const samples = [
    { at: "2026-09-09T08:00:00Z", session: 80, week: 10 },
    { at: "2026-09-09T09:00:00Z", session: 95, week: 12 },
    { at: "2026-09-09T10:00:00Z", session: 5, week: 14 }, // session reset here
    { at: "2026-09-09T11:00:00Z", session: 20, week: 16 }
  ];
  const run = samplesSinceLastReset(samples, "session");
  assert.deepEqual(run.map((sample) => sample.session), [5, 20]);
});

test("burnRatePerHour reads percent-per-hour off a steady climb", () => {
  const samples = [
    { at: "2026-09-09T08:00:00Z", session: 10, week: 0 },
    { at: "2026-09-09T09:00:00Z", session: 20, week: 0 },
    { at: "2026-09-09T10:00:00Z", session: 30, week: 0 }
  ];
  assert.equal(burnRatePerHour(samples, "session"), 10);
});

test("burnRatePerHour returns null when there is too little data to trust a slope", () => {
  assert.equal(burnRatePerHour([{ at: "2026-09-09T08:00:00Z", session: 10, week: 0 }], "session"), null);
});

test("burnRatePerHour can read a negative slope; projectExhaustion then reports no exhaustion", () => {
  const declining = [
    { at: "2026-09-09T08:00:00Z", session: 10, week: 0 },
    { at: "2026-09-09T09:00:00Z", session: 10, week: 0 },
    { at: "2026-09-09T10:00:00Z", session: 9.5, week: 0 }
  ];
  const rate = burnRatePerHour(declining, "session");
  assert.ok(rate !== null && rate < 0);
  assert.equal(projectExhaustion(rate, 9.5, now), null);
});

test("projectExhaustion extrapolates to 100% at the current rate", () => {
  const eta = projectExhaustion(10, 50, now); // 10%/h, 50% left to go => 5h
  assert.equal(eta, new Date(now.getTime() + 5 * 3_600_000).toISOString());
});

test("projectExhaustion is null without a positive rate, and immediate once already at the cap", () => {
  assert.equal(projectExhaustion(null, 50, now), null);
  assert.equal(projectExhaustion(-2, 50, now), null);
  assert.equal(projectExhaustion(5, 100, now), now.toISOString());
});

test("summary scopes samples to the browsed calendar week and reports whether older data exists", () => {
  const store = new HistoryStore(tempDir());
  store.record({ state: "ok", windows: [{ key: "session", percent: 10, resetsAt: null }, { key: "week", percent: 20, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, new Date("2026-09-01T12:00:00Z")); // last week (Tue)
  store.record({ state: "ok", windows: [{ key: "session", percent: 30, resetsAt: null }, { key: "week", percent: 40, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, now); // this week (Wed)

  const current = store.summary("week", 0, now);
  assert.deepEqual(current.samples.map((s) => s.session), [30]);
  assert.equal(current.hasOlder, true);
  assert.equal(current.hasNewer, false);

  const previous = store.summary("week", 1, now);
  assert.deepEqual(previous.samples.map((s) => s.session), [10]);
  assert.equal(previous.hasNewer, true);
});

test("summary scopes samples to the browsed calendar month", () => {
  const store = new HistoryStore(tempDir());
  store.record({ state: "ok", windows: [{ key: "session", percent: 5, resetsAt: null }, { key: "week", percent: 5, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, new Date("2026-08-15T12:00:00Z"));
  store.record({ state: "ok", windows: [{ key: "session", percent: 50, resetsAt: null }, { key: "week", percent: 50, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, now);

  const thisMonth = store.summary("month", 0, now);
  assert.deepEqual(thisMonth.samples.map((s) => s.session), [50]);

  const lastMonth = store.summary("month", 1, now);
  assert.deepEqual(lastMonth.samples.map((s) => s.session), [5]);
});

test("weekConsumption adds up climbs, ignores noise and counts a rollover's fresh usage", () => {
  const consumed = weekConsumption([
    { at: "2026-09-09T08:00:00Z", session: 0, week: 40 },
    { at: "2026-09-09T09:00:00Z", session: 0, week: 45 },
    { at: "2026-09-09T10:00:00Z", session: 0, week: 44.5 }, // noise
    { at: "2026-09-09T11:00:00Z", session: 0, week: 3 } // weekly reset
  ]);
  assert.deepEqual(consumed.map((entry) => entry.points), [5, 0, 3]);
});

test("sessionPeaks splits windows on a drop to zero, a rollover or a long silence", () => {
  const peaks = sessionPeaks([
    { at: "2026-09-09T00:00:00Z", session: 10, week: 0 },
    { at: "2026-09-09T01:00:00Z", session: 60, week: 0 },
    { at: "2026-09-09T02:00:00Z", session: 0, week: 0 },
    { at: "2026-09-09T03:00:00Z", session: 95, week: 0 },
    { at: "2026-09-09T04:00:00Z", session: 4, week: 0 }, // rolled over
    { at: "2026-09-09T12:00:00Z", session: 30, week: 0 } // hours of silence
  ]);
  assert.deepEqual(peaks, [60, 95, 4, 30]);
});

test("weeklyActivity buckets weekly usage by local day and leaves unread days empty", () => {
  const local = (daysBack: number, hour: number): string =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, hour).toISOString();
  const activity = weeklyActivity([
    { at: local(3, 9), session: 20, week: 10 },
    { at: local(3, 18), session: 95, week: 25 },
    { at: local(1, 10), session: 30, week: 40 },
    { at: local(0, 8), session: 10, week: 42 }
  ], now);

  assert.equal(activity.days.length, 7);
  assert.deepEqual(activity.days.map((day) => day.points), [null, null, null, 15, null, 15, 2]);
  assert.equal(activity.dailyAverage, 15);
  assert.equal(activity.changeVsPreviousWeek, null);
  assert.equal(activity.sessionsNearLimit, 1);
});

test("weeklyActivity compares the last seven days with the seven before once both are on record", () => {
  const at = (daysBack: number): string => new Date(now.getTime() - daysBack * 86_400_000).toISOString();
  const activity = weeklyActivity([
    { at: at(14), session: 0, week: 0 },
    { at: at(10), session: 0, week: 20 },
    { at: at(3), session: 0, week: 50 }
  ], now);
  assert.equal(activity.changeVsPreviousWeek, 0.5);
});

test("summary carries weekly activity whatever period is browsed", () => {
  const store = new HistoryStore(tempDir());
  store.record({ state: "ok", windows: [{ key: "session", percent: 10, resetsAt: null }, { key: "week", percent: 20, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, new Date(now.getTime() - 3_600_000));
  store.record({ state: "ok", windows: [{ key: "session", percent: 30, resetsAt: null }, { key: "week", percent: 26, resetsAt: null }], accountEmail: null, updatedAt: null, error: null, sourceLabel: null }, now);
  assert.equal(store.summary("month", 2, now).weekly.days.at(-1)?.points, 6);
});

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "circle-history-test-"));
}
