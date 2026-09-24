import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HISTORY_MAX_SAMPLES, HISTORY_RETENTION_DAYS, SESSION_NEAR_LIMIT_PERCENT, clampPercent } from "../shared/types";
import type { DailyUsage, HistorySample, HistorySummary, HistoryView, Usage, WeeklyActivity } from "../shared/types";

/** Keeps a rolling local log of usage readings so Settings can plot a trend. */
export class HistoryStore {
  private readonly path: string;
  private samples: HistorySample[] | null = null;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, "history.json");
  }

  private load(): HistorySample[] {
    if (this.samples) return this.samples;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as unknown;
      this.samples = Array.isArray(parsed) ? parsed.filter(isSample) : [];
    } catch {
      this.samples = [];
    }
    return this.samples;
  }

  record(usage: Usage, now = new Date()): void {
    if (usage.state !== "ok") return;
    const session = usage.windows.find((window) => window.key === "session")?.percent ?? 0;
    const week = usage.windows.find((window) => window.key === "week")?.percent ?? 0;
    const samples = prune([...this.load(), { at: now.toISOString(), session, week }], now);
    this.samples = samples;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      writeFileSync(temporary, JSON.stringify(samples), { mode: 0o600 });
      renameSync(temporary, this.path);
    } catch {
      // History is a convenience; losing a write must never break a refresh.
    }
  }

  /** `offset` counts periods back from the current one (0 = this week/month, 1 = the previous, …).
   * The burn-rate projection always looks at the last 7 days regardless of the browsed period —
   * it answers "at today's pace", not "at that period's pace". */
  summary(view: HistoryView = "week", offset = 0, now = new Date()): HistorySummary {
    const all = prune(this.load(), now);
    const range = view === "month" ? monthRange(now, offset) : weekRange(now, offset);
    const period = all.filter((sample) => {
      const at = Date.parse(sample.at);
      return at >= range.from && at < range.to;
    });

    const recent = all.filter((sample) => Date.parse(sample.at) >= now.getTime() - 7 * 86_400_000);
    const latest = recent[recent.length - 1];
    const sessionRate = burnRatePerHour(recent, "session");
    const weekRate = burnRatePerHour(recent, "week");

    return {
      samples: period,
      peakSession: period.reduce((peak, sample) => Math.max(peak, sample.session), 0),
      peakWeek: period.reduce((peak, sample) => Math.max(peak, sample.week), 0),
      sessionRatePerHour: sessionRate,
      weekRatePerHour: weekRate,
      projectedSessionExhaustion: latest ? projectExhaustion(sessionRate, latest.session, now) : null,
      projectedWeekExhaustion: latest ? projectExhaustion(weekRate, latest.week, now) : null,
      rangeFrom: new Date(range.from).toISOString(),
      rangeTo: new Date(range.to).toISOString(),
      hasOlder: all.some((sample) => Date.parse(sample.at) < range.from),
      hasNewer: offset > 0,
      weekly: weeklyActivity(all, now)
    };
  }
}

interface Range { from: number; to: number; }

/** Monday-start calendar week, `offset` weeks back from the one `now` falls in. */
function weekRange(now: Date, offset: number): Range {
  const day = now.getDay();
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday - offset * 7);
  const from = monday.getTime();
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();
  return { from, to };
}

/** Calendar month, `offset` months back from the one `now` falls in. */
function monthRange(now: Date, offset: number): Range {
  const first = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const from = first.getTime();
  const to = new Date(first.getFullYear(), first.getMonth() + 1, 1).getTime();
  return { from, to };
}

const MIN_TREND_SAMPLES = 3;
const MIN_TREND_SPAN_HOURS = 0.5;
/** A drop bigger than noise means the window rolled over; the trend should not span across that. */
const RESET_DROP_THRESHOLD = 1;

/** Only the run since the last observed reset, so a rolling window's sawtooth doesn't flatten the slope. */
export function samplesSinceLastReset(samples: HistorySample[], key: "session" | "week"): HistorySample[] {
  let startIndex = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous && current && current[key] < previous[key] - RESET_DROP_THRESHOLD) startIndex = index;
  }
  return samples.slice(startIndex);
}

/** Percentage points climbed per hour, via least-squares over the current run, or null when the
 * trend is too thin (few samples, short span, flat/falling) to extrapolate from. */
export function burnRatePerHour(samples: HistorySample[], key: "session" | "week"): number | null {
  const run = samplesSinceLastReset(samples, key);
  if (run.length < MIN_TREND_SAMPLES) return null;
  const firstAt = Date.parse(run[0]!.at);
  const points = run.map((sample) => ({ hours: (Date.parse(sample.at) - firstAt) / 3_600_000, percent: sample[key] }));
  const spanHours = points[points.length - 1]!.hours;
  if (spanHours < MIN_TREND_SPAN_HOURS) return null;
  const meanX = points.reduce((sum, point) => sum + point.hours, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.percent, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + (point.hours - meanX) * (point.percent - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + (point.hours - meanX) ** 2, 0);
  return denominator === 0 ? null : numerator / denominator;
}

/** When the current pace hits 100%, or null when usage isn't climbing. */
export function projectExhaustion(ratePerHour: number | null, currentPercent: number, now: Date): string | null {
  if (ratePerHour === null || ratePerHour <= 0) return null;
  if (currentPercent >= 100) return now.toISOString();
  const hoursRemaining = (100 - currentPercent) / ratePerHour;
  return new Date(now.getTime() + hoursRemaining * 3_600_000).toISOString();
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const SESSION_WINDOW_MS = 5 * 3_600_000;

interface Consumption { at: number; points: number; }

/** Weekly-window points each reading added since the one before it, dated at the later reading.
 * A drop bigger than noise is a rollover, so the reading itself is what was used since the reset. */
export function weekConsumption(samples: HistorySample[]): Consumption[] {
  const consumed: Consumption[] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const change = current.week - previous.week;
    const points = change < -RESET_DROP_THRESHOLD ? current.week : Math.max(0, change);
    consumed.push({ at: Date.parse(current.at), points });
  }
  return consumed;
}

/** Peak of each session window in the log. A window ends when usage drops to zero, rolls over,
 * or the readings go quiet for longer than a whole session. */
export function sessionPeaks(samples: HistorySample[]): number[] {
  const peaks: number[] = [];
  let peak: number | null = null;
  let previous: HistorySample | undefined;
  for (const sample of samples) {
    const rolledOver = previous !== undefined && (
      sample.session < previous.session - RESET_DROP_THRESHOLD
      || Date.parse(sample.at) - Date.parse(previous.at) >= SESSION_WINDOW_MS
    );
    if (peak !== null && (rolledOver || sample.session <= 0)) {
      peaks.push(peak);
      peak = null;
    }
    if (sample.session > 0) peak = Math.max(peak ?? 0, sample.session);
    previous = sample;
  }
  if (peak !== null) peaks.push(peak);
  return peaks;
}

/** Weekly-window activity over the last seven days, read off the whole log so it never depends on the browsed period. */
export function weeklyActivity(samples: HistorySample[], now: Date): WeeklyActivity {
  const nowMs = now.getTime();
  // One reading before the two-week horizon gives the first delta inside it something to compare against.
  const horizon = nowMs - 2 * WEEK_MS;
  const firstInside = samples.findIndex((sample) => Date.parse(sample.at) >= horizon);
  const relevant = firstInside < 0 ? [] : samples.slice(Math.max(0, firstInside - 1));
  const consumed = weekConsumption(relevant);
  const pointsBetween = (from: number, to: number): number =>
    consumed.reduce((sum, entry) => (entry.at >= from && entry.at < to ? sum + entry.points : sum), 0);
  const readAt = relevant.map((sample) => Date.parse(sample.at));

  const days: DailyUsage[] = Array.from({ length: 7 }, (_unused, index) => {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index).getTime();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5 + index).getTime();
    const hasReading = readAt.some((at) => at >= from && at < to);
    return { day: new Date(from).toISOString(), points: hasReading ? pointsBetween(from, to) : null };
  });

  // Today is still under way, so it would drag the average down.
  const complete = days.slice(0, -1).flatMap((day) => (day.points === null ? [] : [day.points]));
  const dailyAverage = complete.length ? complete.reduce((sum, points) => sum + points, 0) / complete.length : null;

  const firstAt = samples.length ? Date.parse(samples[0]!.at) : Number.POSITIVE_INFINITY;
  const lastWeek = pointsBetween(nowMs - WEEK_MS, nowMs + 1);
  const weekBefore = pointsBetween(horizon, nowMs - WEEK_MS);
  const changeVsPreviousWeek = firstAt <= horizon + DAY_MS && weekBefore >= 1 ? (lastWeek - weekBefore) / weekBefore : null;

  const peaks = sessionPeaks(relevant.filter((_sample, index) => readAt[index]! >= nowMs - WEEK_MS));
  return {
    days,
    dailyAverage,
    changeVsPreviousWeek,
    sessionsStarted: peaks.length,
    sessionsNearLimit: peaks.filter((peak) => peak >= SESSION_NEAR_LIMIT_PERCENT).length
  };
}

function isSample(value: unknown): value is HistorySample {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.at === "string" && Number.isFinite(Date.parse(raw.at))
    && typeof raw.session === "number" && typeof raw.week === "number";
}

export function prune(samples: HistorySample[], now: Date): HistorySample[] {
  const cutoff = now.getTime() - HISTORY_RETENTION_DAYS * 86_400_000;
  return samples
    .filter((sample) => Date.parse(sample.at) >= cutoff)
    .map((sample) => ({ at: sample.at, session: clampPercent(sample.session), week: clampPercent(sample.week) }))
    .slice(-HISTORY_MAX_SAMPLES);
}
