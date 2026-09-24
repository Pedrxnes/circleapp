/** Usage windows Circle knows how to display, in the order they are shown. */
export type MetricKey = "session" | "week" | "weekOpus";

export const ALL_METRIC_KEYS: MetricKey[] = ["session", "week", "weekOpus"];

export interface UsageWindow {
  key: MetricKey;
  /** Percentage of the credit window already consumed, 0-100. */
  percent: number;
  /** ISO timestamp for when the window rolls over, when the API reports one. */
  resetsAt: string | null;
}

export type UsageState = "ok" | "error" | "no-credentials";

export interface Usage {
  state: UsageState;
  windows: UsageWindow[];
  accountEmail: string | null;
  updatedAt: string | null;
  error: string | null;
  /** Where the reading came from, so Settings can show the active source. */
  sourceLabel: string | null;
}

export type RingMetric = "session" | "week" | "highest";
export type ColorMode = "dynamic" | "fixed";
export type OrbSize = "small" | "medium" | "large";
export type Language = "en" | "pt-BR";

export interface SourceChoice {
  location: "host" | "wsl";
  distro?: string;
}

export interface WslPresence {
  distro: string;
  present: boolean;
}

export interface SourceInfo {
  host: boolean;
  wsl: WslPresence[];
  active: SourceChoice | null;
  saved: SourceChoice | null;
}

export interface Settings {
  /** Master switch for the floating orb; when off, Circle lives in the tray only. */
  orbEnabled: boolean;
  /** Temporary hide, restored from the taskbar overflow ("hidden icons") tray menu. */
  orbHidden: boolean;
  orbSize: OrbSize;
  /** Idle opacity, 0.25-1. The orb always animates to full opacity on hover. */
  orbOpacity: number;
  /** Screen coordinates of the orb centre; null until the orb is first placed. */
  orbCenterX: number | null;
  orbCenterY: number | null;
  lockPosition: boolean;
  alwaysOnTop: boolean;
  showPercentLabel: boolean;
  ringMetric: RingMetric;
  colorMode: ColorMode;
  accentColor: string;
  refreshIntervalSeconds: number;
  notificationsEnabled: boolean;
  /** Ascending percentages that trigger one notification each time they are crossed. */
  notificationThresholds: number[];
  language: Language;
  source: SourceChoice | null;
}

export interface HistorySample {
  at: string;
  session: number;
  week: number;
}

/** Calendar granularity the trend chart can be browsed by. */
export type HistoryView = "week" | "month";

export function isHistoryView(value: unknown): value is HistoryView {
  return value === "week" || value === "month";
}

export interface HistorySummary {
  samples: HistorySample[];
  peakSession: number;
  peakWeek: number;
  /** Percentage points climbed per hour since the window's last observed reset, or null when the trend is too thin to trust. */
  sessionRatePerHour: number | null;
  weekRatePerHour: number | null;
  /** ISO timestamp for when the current pace would hit 100%, or null when usage isn't climbing. */
  projectedSessionExhaustion: string | null;
  projectedWeekExhaustion: string | null;
  /** Calendar bounds of the browsed period, [rangeFrom, rangeTo). */
  rangeFrom: string;
  rangeTo: string;
  /** Whether stored samples reach further back than this period, or forward of it. */
  hasOlder: boolean;
  hasNewer: boolean;
  /** Weekly-window activity over the last seven days, whatever period is being browsed. */
  weekly: WeeklyActivity;
}

export interface DailyUsage {
  /** Local midnight that opens the day, as an ISO timestamp. */
  day: string;
  /** Weekly-window percentage points used that day, or null when Circle took no reading. */
  points: number | null;
}

export interface WeeklyActivity {
  /** The last seven local calendar days, oldest first, ending with today. */
  days: DailyUsage[];
  /** Mean points per day over the complete days that have readings, or null with none. */
  dailyAverage: number | null;
  /** Relative change in points used over the last 7 days against the 7 before, or null without both on record. */
  changeVsPreviousWeek: number | null;
  /** Session windows opened in the last 7 days, and how many of them peaked near the cap. */
  sessionsStarted: number;
  sessionsNearLimit: number;
}

export interface ModelShare {
  /** Model id exactly as Claude Code logged it, e.g. "claude-opus-4-1-20250805". */
  model: string;
  /** Fraction of the window's API-equivalent cost this model accounts for, 0-1. */
  share: number;
  /** Estimated percentage points of the window's limit, or null when that percent is unknown. */
  percent: number | null;
  /** Assistant replies logged for this model in the window. */
  replies: number;
}

export interface ModelWindow {
  /** Bounds of the window, [start, end). */
  start: string;
  end: string;
  /** Whether the window is still open. */
  active: boolean;
  /** Usage of the window's limit: live for open windows, the peak Circle recorded for closed ones. */
  percent: number | null;
  models: ModelShare[];
}

export interface ModelUsageSummary {
  /** Whether Claude Code's local transcripts were found at all. */
  logsFound: boolean;
  week: ModelWindow;
  /** Session windows from the last 7 days, newest first. */
  sessions: ModelWindow[];
}

export interface ExhaustionWarning {
  key: "session" | "week";
  etaIso: string;
}

/** Windows whose current burn rate would hit 100% before they naturally reset. */
export function exhaustionWarnings(usage: Usage, history: HistorySummary): ExhaustionWarning[] {
  const candidates: { key: "session" | "week"; etaIso: string | null }[] = [
    { key: "session", etaIso: history.projectedSessionExhaustion },
    { key: "week", etaIso: history.projectedWeekExhaustion }
  ];
  return candidates.flatMap(({ key, etaIso }) => {
    if (!etaIso) return [];
    const window = findWindow(usage, key);
    if (!window) return [];
    if (window.resetsAt && Date.parse(etaIso) >= Date.parse(window.resetsAt)) return [];
    return [{ key, etaIso }];
  });
}

export interface LoginItemStatus {
  available: boolean;
  enabled: boolean;
}

export interface AppInfo {
  version: string;
  platform: string;
  packaged: boolean;
  dataPath: string;
  electron: string;
}

/** Geometry the main process computes so the orb renderer only does layout. */
export interface OrbLayout {
  boxWidth: number;
  boxHeight: number;
  orbDiameter: number;
  /** Orb centre expressed inside the transparent window box. */
  centerX: number;
  centerY: number;
  /** Side of the orb the hover panel opens towards. */
  anchor: "left" | "right";
}

export const ORB_DIAMETERS: Record<OrbSize, number> = { small: 56, medium: 72, large: 92 };
export const ORB_MAX_DIAMETER = 92;
export const ORB_BOX_PADDING = 14;
export const PANEL_WIDTH = 268;
export const PANEL_GAP = 12;
export const ORB_BOX_WIDTH = PANEL_WIDTH + PANEL_GAP + ORB_MAX_DIAMETER + ORB_BOX_PADDING * 2;
export const ORB_BOX_HEIGHT = 300;

export const MIN_REFRESH_INTERVAL_SECONDS = 60;
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;
export const PRESENCE_CACHE_TTL_MS = 30_000;
export const HISTORY_RETENTION_DAYS = 90;
/** Session windows listed in the model breakdown, newest first. */
export const MODEL_SESSIONS_SHOWN = 12;
/** ~90 days at the default 5-minute refresh interval; a faster interval trims older days first. */
export const HISTORY_MAX_SAMPLES = 26_000;
/** A session whose peak reached this counts as having run close to its cap. */
export const SESSION_NEAR_LIMIT_PERCENT = 90;

export const DEFAULT_ACCENT = "#d97757";

export const ACCENT_PRESETS: { id: string; hex: string }[] = [
  { id: "orange", hex: "#d97757" },
  { id: "green", hex: "#30d158" },
  { id: "blue", hex: "#0a84ff" },
  { id: "purple", hex: "#bf5af2" },
  { id: "pink", hex: "#ff375f" },
  { id: "yellow", hex: "#ffd60a" },
  { id: "teal", hex: "#40c8e0" },
  { id: "white", hex: "#e8eaed" }
];

export const DEFAULT_SETTINGS: Settings = {
  orbEnabled: true,
  orbHidden: false,
  orbSize: "medium",
  orbOpacity: 0.92,
  orbCenterX: null,
  orbCenterY: null,
  lockPosition: false,
  alwaysOnTop: true,
  showPercentLabel: true,
  ringMetric: "session",
  colorMode: "dynamic",
  accentColor: DEFAULT_ACCENT,
  refreshIntervalSeconds: DEFAULT_REFRESH_INTERVAL_SECONDS,
  notificationsEnabled: true,
  notificationThresholds: [75, 90],
  language: "en",
  source: null
};

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

/** Traffic-light ramp used when the ring colour follows usage instead of a fixed accent. */
export function dynamicColor(percent: number): string {
  const value = clampPercent(percent);
  if (value >= 90) return "#ff453a";
  if (value >= 75) return "#ff9f0a";
  if (value >= 50) return "#ffd60a";
  return "#30d158";
}

export function ringColor(percent: number, mode: ColorMode, accent: string): string {
  return mode === "fixed" ? accent : dynamicColor(percent);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isOrbSize(value: unknown): value is OrbSize {
  return value === "small" || value === "medium" || value === "large";
}

export function isRingMetric(value: unknown): value is RingMetric {
  return value === "session" || value === "week" || value === "highest";
}

export function isColorMode(value: unknown): value is ColorMode {
  return value === "dynamic" || value === "fixed";
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "pt-BR";
}

export function isMetricKey(value: unknown): value is MetricKey {
  return value === "session" || value === "week" || value === "weekOpus";
}

export function findWindow(usage: Usage, key: MetricKey): UsageWindow | undefined {
  return usage.windows.find((window) => window.key === key);
}

/** Percentage the orb ring renders, following the user's chosen metric. */
export function ringPercent(usage: Usage, metric: RingMetric): number {
  const session = findWindow(usage, "session")?.percent ?? 0;
  const week = findWindow(usage, "week")?.percent ?? 0;
  if (metric === "session") return clampPercent(session);
  if (metric === "week") return clampPercent(week);
  return clampPercent(Math.max(session, week));
}

/** The metric drawn on the orb's inner ring: whichever of the two is not primary. */
export function secondaryMetric(metric: RingMetric): MetricKey {
  return metric === "week" ? "session" : "week";
}
