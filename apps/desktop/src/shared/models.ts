/** Claude model ids as Claude Code logs them, turned into names and relative prices. */

export type ModelFamily = "fable" | "opus" | "sonnet" | "haiku" | "other";

export interface ModelId {
  family: ModelFamily;
  major: number | null;
  minor: number | null;
}

/** "claude-opus-4-1-20250805", "claude-3-5-sonnet-20241022", "claude-opus-5[1m]" and friends. */
export function parseModelId(id: string): ModelId {
  const bare = id.trim().toLowerCase().replace(/\[.*\]$/, "");
  const modern = /^claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(bare);
  if (modern) return { family: familyOf(modern[1]!), major: Number(modern[2]), minor: modern[3] ? Number(modern[3]) : null };
  const legacy = /^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)(?:-\d{8}|-latest)?$/.exec(bare);
  if (legacy) return { family: familyOf(legacy[3]!), major: Number(legacy[1]), minor: legacy[2] ? Number(legacy[2]) : null };
  const loose = /(fable|mythos|opus|sonnet|haiku)/.exec(bare);
  return { family: loose ? familyOf(loose[1]!) : "other", major: null, minor: null };
}

function familyOf(name: string): ModelFamily {
  // Mythos is the same tier and price as Fable, only offered through a separate programme.
  if (name === "mythos" || name === "fable") return "fable";
  return name as ModelFamily;
}

const FAMILY_NAMES: Record<ModelFamily, string> = { fable: "Fable", opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", other: "" };

/** "Opus 4.1" for display; the raw id when it isn't a Claude model name Circle recognises. */
export function modelLabel(id: string): string {
  const parsed = parseModelId(id);
  if (parsed.family === "other") return id;
  const name = /mythos/i.test(id) ? "Mythos" : FAMILY_NAMES[parsed.family];
  if (parsed.major === null) return name;
  return parsed.minor === null ? `${name} ${parsed.major}` : `${name} ${parsed.major}.${parsed.minor}`;
}

/** USD per million tokens. Cache writes are priced off `input` (1.25× for 5 minutes, 2× for an hour). */
export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;
}

function rates(input: number, output: number, cacheRead = input / 10): ModelRates {
  return { input, output, cacheRead };
}

/** Anthropic's published API prices. Plans meter usage by cost, not by raw tokens, so these are
 * what lets one Opus reply weigh more than one Haiku reply of the same size. */
export function modelRates(id: string): ModelRates {
  const { family, major, minor } = parseModelId(id);
  const version = major === null ? null : major * 100 + (minor ?? 0);
  switch (family) {
    case "fable":
      return version !== null && version >= 501 ? rates(10, 50, 0.25) : rates(10, 50, 1);
    case "opus":
      if (version === null) return rates(5, 25);
      if (version >= 505) return rates(4, 20);
      if (version >= 405) return rates(5, 25);
      return rates(15, 75);
    case "sonnet":
      return version !== null && version >= 500 ? rates(2, 10) : rates(3, 15);
    case "haiku":
      if (version === null || version >= 405) return rates(1, 5);
      if (version >= 305) return rates(0.8, 4);
      return rates(0.25, 1.25);
    default:
      return rates(3, 15);
  }
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/** What a reply would have cost on the API, in USD. Only ever compared against other replies. */
export function apiCost(id: string, tokens: TokenCounts): number {
  const price = modelRates(id);
  return (
    tokens.input * price.input
    + tokens.cacheWrite5m * price.input * 1.25
    + tokens.cacheWrite1h * price.input * 2
    + tokens.cacheRead * price.cacheRead
    + tokens.output * price.output
  ) / 1_000_000;
}

const FAMILY_COLORS: Record<ModelFamily, string> = {
  fable: "#bf5af2",
  opus: "#d97757",
  sonnet: "#0a84ff",
  haiku: "#30d158",
  other: "#8a8f98"
};

/** Colour for a model in a breakdown. A second model of the same family in one list is drawn
 * lighter, so "Opus 4.8" and "Opus 5" stay apart without breaking the family colour. */
export function modelColor(id: string, sameFamilyIndex = 0): string {
  const base = FAMILY_COLORS[parseModelId(id).family];
  if (sameFamilyIndex <= 0) return base;
  const mix = Math.max(35, 100 - sameFamilyIndex * 28);
  return `color-mix(in srgb, ${base} ${mix}%, #ffffff)`;
}

export function modelFamily(id: string): ModelFamily {
  return parseModelId(id).family;
}
