import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_SETTINGS,
  MIN_REFRESH_INTERVAL_SECONDS,
  isColorMode,
  isHexColor,
  isLanguage,
  isOrbSize,
  isRingMetric
} from "../shared/types";
import type { Settings, SourceChoice } from "../shared/types";

/** Every value is validated on read so a hand-edited file can never crash the app. */
export function normalizeSettings(value: unknown): Settings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const boolean = (key: keyof Settings): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean);
  const coordinate = (key: "orbCenterX" | "orbCenterY"): number | null =>
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? Math.round(raw[key] as number) : null;

  return {
    orbEnabled: boolean("orbEnabled"),
    orbHidden: boolean("orbHidden"),
    orbSize: isOrbSize(raw.orbSize) ? raw.orbSize : DEFAULT_SETTINGS.orbSize,
    orbOpacity: typeof raw.orbOpacity === "number" && Number.isFinite(raw.orbOpacity)
      ? Math.max(0.25, Math.min(1, raw.orbOpacity))
      : DEFAULT_SETTINGS.orbOpacity,
    orbCenterX: coordinate("orbCenterX"),
    orbCenterY: coordinate("orbCenterY"),
    lockPosition: boolean("lockPosition"),
    alwaysOnTop: boolean("alwaysOnTop"),
    showPercentLabel: boolean("showPercentLabel"),
    ringMetric: isRingMetric(raw.ringMetric) ? raw.ringMetric : DEFAULT_SETTINGS.ringMetric,
    colorMode: isColorMode(raw.colorMode) ? raw.colorMode : DEFAULT_SETTINGS.colorMode,
    accentColor: isHexColor(raw.accentColor) ? raw.accentColor : DEFAULT_SETTINGS.accentColor,
    refreshIntervalSeconds: typeof raw.refreshIntervalSeconds === "number" && Number.isFinite(raw.refreshIntervalSeconds)
      ? Math.max(MIN_REFRESH_INTERVAL_SECONDS, Math.round(raw.refreshIntervalSeconds))
      : DEFAULT_SETTINGS.refreshIntervalSeconds,
    notificationsEnabled: boolean("notificationsEnabled"),
    notificationThresholds: normalizeThresholds(raw.notificationThresholds),
    language: isLanguage(raw.language) ? raw.language : DEFAULT_SETTINGS.language,
    source: normalizeSource(raw.source)
  };
}

export function normalizeThresholds(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.notificationThresholds];
  const cleaned = value
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => Math.max(1, Math.min(100, Math.round(entry))));
  return [...new Set(cleaned)].sort((left, right) => left - right).slice(0, 5);
}

export function normalizeSource(value: unknown): SourceChoice | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.location === "host") return { location: "host" };
  if (raw.location === "wsl" && typeof raw.distro === "string" && raw.distro.length > 0) {
    return { location: "wsl", distro: raw.distro };
  }
  return null;
}

export class SettingsStore {
  private readonly path: string;
  private cache: Settings | null = null;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, "settings.json");
  }

  load(): Settings {
    if (this.cache) return this.cache;
    try {
      this.cache = normalizeSettings(JSON.parse(readFileSync(this.path, "utf8")));
    } catch {
      this.cache = { ...DEFAULT_SETTINGS };
    }
    return this.cache;
  }

  /** Merge a partial update, validate the result and persist it atomically. */
  update(patch: Partial<Settings>): Settings {
    const next = normalizeSettings({ ...this.load(), ...patch });
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
    this.cache = next;
    return next;
  }
}
