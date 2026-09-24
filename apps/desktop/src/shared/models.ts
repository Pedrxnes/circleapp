/** Display helpers for Claude model ids. Pure, so both processes can use them. */

const FAMILY_COLORS: Record<string, string> = {
  opus: "#d97757",
  sonnet: "#0a84ff",
  haiku: "#30d158",
  fable: "#bf5af2"
};

const FALLBACK_COLORS = ["#40c8e0", "#ff375f", "#ffd60a", "#e8eaed"];

/** The id with provider prefixes, `claude-`, date stamps and context-size suffixes removed. */
function bareModel(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^(?:[a-z0-9-]+\.)?anthropic\./, "")
    .replace(/\[[^\]]*\]$/, "")
    .replace(/^claude-/, "")
    .replace(/-v\d+(?::\d+)?$/, "")
    .replace(/@\d{8}$/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-latest$/, "");
}

/** "claude-opus-4-1-20250805" → "Opus 4.1", "claude-3-5-sonnet-20241022" → "Sonnet 3.5". */
export function modelLabel(id: string): string {
  const parts = bareModel(id).split("-").filter(Boolean);
  const words = parts.filter((part) => !/^\d+$/.test(part));
  const numbers = parts.filter((part) => /^\d+$/.test(part));
  if (words.length === 0) return id;
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return numbers.length ? `${name} ${numbers.join(".")}` : name;
}

/** Lower-case family name ("opus", "sonnet", …), or the first word of an unknown id. */
export function modelFamily(id: string): string {
  const parts = bareModel(id).split("-").filter((part) => !/^\d+$/.test(part));
  return parts[0] ?? id;
}

/** Blend a #rrggbb colour towards white by `amount` (0-1). */
function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): string => {
    const base = (value >> shift) & 0xff;
    return Math.round(base + (255 - base) * amount).toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * A stable colour per model: each family keeps its hue, and a second or third
 * version of the same family is drawn lighter so the two stay distinguishable.
 * `models` should be in display order so the first of a family gets the pure hue.
 */
export function modelColors(models: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  const families = new Map<string, { base: string; seen: number }>();
  let fallback = 0;
  for (const model of models) {
    if (colors[model]) continue;
    const name = modelFamily(model);
    const family = families.get(name)
      ?? { base: FAMILY_COLORS[name] ?? FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length]!, seen: 0 };
    families.set(name, family);
    colors[model] = family.seen === 0 ? family.base : lighten(family.base, Math.min(0.7, family.seen * 0.35));
    family.seen++;
  }
  return colors;
}
