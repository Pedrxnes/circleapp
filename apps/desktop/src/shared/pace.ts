import { clampPercent, findWindow } from "./types";
import type { Usage } from "./types";

export const WEEK_WINDOW_HOURS = 168;
/** The share of the weekly window one day uses when credit is spread evenly across the week. */
export const EXPECTED_DAILY_POINTS = 100 / 7;
/** How far weekly usage may stray from an even spread and still count as on pace. */
export const PACE_TOLERANCE_POINTS = 5;

/** Below: credit to spare. On: close to an even spread. Over: using credit faster than the week allows. */
export type PaceStatus = "under" | "on" | "over";

export interface WeeklyPace {
  percent: number;
  /** Where an even spread would put usage by now, 0-100. */
  expectedPercent: number;
  /** `percent - expectedPercent`, in percentage points. */
  delta: number;
  status: PaceStatus;
  hoursToReset: number;
  /** Where the week lands when it resets at the current burn rate, capped at 100, or null when the trend is too thin. */
  projectedAtReset: number | null;
  /** Points per day that spread the remaining credit evenly until the reset; all of it once less than a day is left. */
  dailyBudget: number;
}

export function paceStatus(delta: number): PaceStatus {
  if (delta > PACE_TOLERANCE_POINTS) return "over";
  if (delta < -PACE_TOLERANCE_POINTS) return "under";
  return "on";
}

/** Status of a single day's usage against the even daily share. */
export function dayStatus(points: number): PaceStatus {
  return points > EXPECTED_DAILY_POINTS ? "over" : "on";
}

/** Weekly usage measured against an even spread of the window that ends at its reset time,
 * or null when there is no successful reading or Anthropic reports no reset time for the week. */
export function weeklyPace(usage: Usage, weekRatePerHour: number | null, now = new Date()): WeeklyPace | null {
  if (usage.state !== "ok") return null;
  const window = findWindow(usage, "week");
  if (!window?.resetsAt) return null;
  const resetsAt = Date.parse(window.resetsAt);
  if (!Number.isFinite(resetsAt)) return null;
  const hoursToReset = (resetsAt - now.getTime()) / 3_600_000;
  if (hoursToReset <= 0) return null;

  const percent = clampPercent(window.percent);
  const elapsed = Math.max(0, Math.min(1, 1 - hoursToReset / WEEK_WINDOW_HOURS));
  const expectedPercent = elapsed * 100;
  const delta = percent - expectedPercent;
  const projectedAtReset = weekRatePerHour === null
    ? null
    : clampPercent(percent + Math.max(0, weekRatePerHour) * hoursToReset);
  const dailyBudget = (100 - percent) / Math.max(1, hoursToReset / 24);
  return { percent, expectedPercent, delta, status: paceStatus(delta), hoursToReset, projectedAtReset, dailyBudget };
}
