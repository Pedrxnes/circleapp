import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_DAILY_POINTS, dayStatus, paceStatus, weeklyPace } from "../shared/pace";
import type { Usage } from "../shared/types";

const now = new Date("2026-09-09T12:00:00Z");
const hoursFromNow = (hours: number): string => new Date(now.getTime() + hours * 3_600_000).toISOString();

function usageWithWeek(percent: number, resetsAt: string | null): Usage {
  return {
    state: "ok",
    windows: [{ key: "session", percent: 10, resetsAt: null }, { key: "week", percent, resetsAt }],
    accountEmail: null,
    updatedAt: null,
    error: null,
    sourceLabel: null
  };
}

test("paceStatus allows a tolerance band around an even spread", () => {
  assert.equal(paceStatus(0), "on");
  assert.equal(paceStatus(5), "on");
  assert.equal(paceStatus(-5), "on");
  assert.equal(paceStatus(5.1), "over");
  assert.equal(paceStatus(-5.1), "under");
});

test("dayStatus compares a day against the even daily share", () => {
  assert.equal(dayStatus(EXPECTED_DAILY_POINTS), "on");
  assert.equal(dayStatus(EXPECTED_DAILY_POINTS + 0.1), "over");
});

test("weeklyPace measures usage against the share of the window already elapsed", () => {
  // Half of the week left: an even spread expects 50%.
  const pace = weeklyPace(usageWithWeek(64, hoursFromNow(84)), null, now);
  assert.ok(pace);
  assert.equal(pace.expectedPercent, 50);
  assert.equal(pace.delta, 14);
  assert.equal(pace.status, "over");
  assert.equal(pace.hoursToReset, 84);
});

test("weeklyPace reports credit to spare when usage trails an even spread", () => {
  const pace = weeklyPace(usageWithWeek(20, hoursFromNow(84)), null, now);
  assert.equal(pace?.status, "under");
});

test("weeklyPace projects the reset from the burn rate and caps it at 100", () => {
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(48)), 0.5, now)?.projectedAtReset, 64);
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(48)), 5, now)?.projectedAtReset, 100);
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(48)), -1, now)?.projectedAtReset, 40);
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(48)), null, now)?.projectedAtReset, null);
});

test("weeklyPace spreads the remaining credit over the days left, or all of it on the last day", () => {
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(72)), null, now)?.dailyBudget, 20);
  assert.equal(weeklyPace(usageWithWeek(70, hoursFromNow(6)), null, now)?.dailyBudget, 30);
});

test("weeklyPace is null without a reset time, a successful reading, or a reset still ahead", () => {
  assert.equal(weeklyPace(usageWithWeek(40, null), null, now), null);
  assert.equal(weeklyPace(usageWithWeek(40, hoursFromNow(-1)), null, now), null);
  assert.equal(weeklyPace({ ...usageWithWeek(40, hoursFromNow(24)), state: "error" }, null, now), null);
});
