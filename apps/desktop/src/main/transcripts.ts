import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { apiCost } from "../shared/models";
import type { TokenCounts } from "../shared/models";
import { MODEL_SESSIONS_SHOWN, clampPercent, findWindow } from "../shared/types";
import type { HistorySample, ModelShare, ModelUsageSummary, ModelWindow, Usage } from "../shared/types";

/** One assistant reply Claude Code logged, reduced to what the model breakdown needs. */
export interface UsageEntry extends TokenCounts {
  at: number;
  model: string;
  /** Message and request id. Claude Code logs a reply once per content block and copies
   * history into resumed sessions, so the same reply can appear many times. */
  key: string | null;
  /** API-equivalent cost in USD, the weight a reply carries against the others. */
  cost: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SESSION_MS = 5 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
/** A whole weekly window plus a day of slack for where it started. */
export const TRANSCRIPT_HORIZON_MS = 8 * DAY_MS;
/** projects/<project>/<session>.jsonl, and subagent logs a level or two below that. */
const MAX_DEPTH = 4;
const READ_CHUNK_BYTES = 1 << 20;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The usage an assistant line in a Claude Code transcript reports, or null for any other line. */
export function parseTranscriptLine(line: string): UsageEntry | null {
  // Most lines are prompts and tool results; skip them before paying for JSON.parse.
  if (!line.includes("\"usage\"")) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as { type?: unknown; timestamp?: unknown; requestId?: unknown; message?: unknown };
  if (record.type !== "assistant" || typeof record.message !== "object" || record.message === null) return null;
  const message = record.message as { id?: unknown; model?: unknown; usage?: unknown };
  // "<synthetic>" marks replies Claude Code made up locally, which never reached a model.
  if (typeof message.model !== "string" || !message.model || message.model.startsWith("<")) return null;
  const at = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : Number.NaN;
  if (!Number.isFinite(at) || typeof message.usage !== "object" || message.usage === null) return null;

  const usage = message.usage as Record<string, unknown>;
  const breakdown = typeof usage.cache_creation === "object" && usage.cache_creation !== null
    ? usage.cache_creation as Record<string, unknown>
    : {};
  const cacheWrite1h = count(breakdown.ephemeral_1h_input_tokens);
  const cacheWriteTotal = usage.cache_creation_input_tokens === undefined
    ? count(breakdown.ephemeral_5m_input_tokens) + cacheWrite1h
    : count(usage.cache_creation_input_tokens);
  const tokens: TokenCounts = {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheWrite5m: Math.max(0, cacheWriteTotal - cacheWrite1h),
    cacheWrite1h: Math.min(cacheWrite1h, cacheWriteTotal),
    cacheRead: count(usage.cache_read_input_tokens)
  };
  const key = typeof message.id === "string" && message.id
    ? `${message.id}:${typeof record.requestId === "string" ? record.requestId : ""}`
    : null;
  return { at, model: message.model, key, ...tokens, cost: apiCost(message.model, tokens) };
}

/** One entry per reply, oldest first. When a reply was logged more than once, the copy with the
 * most output wins: the lines written while it streamed can carry partial counts. */
export function dedupeEntries(entries: UsageEntry[], since = Number.NEGATIVE_INFINITY): UsageEntry[] {
  const unique = new Map<string, UsageEntry>();
  const unkeyed: UsageEntry[] = [];
  for (const entry of entries) {
    if (entry.at < since) continue;
    if (entry.key === null) { unkeyed.push(entry); continue; }
    const existing = unique.get(entry.key);
    if (!existing || entry.output > existing.output) unique.set(entry.key, entry);
  }
  return [...unique.values(), ...unkeyed].sort((left, right) => left.at - right.at);
}

interface FileState {
  size: number;
  /** Bytes parsed so far; always the end of a complete line. */
  offset: number;
  entries: UsageEntry[];
}

/**
 * Reads Claude Code's session transcripts for the model breakdown. Transcripts are append-only
 * and can run to hundreds of megabytes, so each file is parsed once and afterwards only the bytes
 * appended since are read. Only model names, timestamps and token counts are kept — never content.
 */
export class TranscriptStore {
  private readonly files = new Map<string, FileState>();

  constructor(private readonly roots: () => Promise<string[]>) {}

  async read(now = Date.now()): Promise<{ found: boolean; entries: UsageEntry[] }> {
    const since = now - TRANSCRIPT_HORIZON_MS;
    let found = false;
    const seen = new Set<string>();
    for (const root of await this.roots()) {
      const files = await listTranscripts(root, since);
      if (files === null) continue;
      found = true;
      for (const file of files) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        await this.refresh(file.path, file.size, since);
      }
    }
    // Files that went quiet past the horizon, or belong to a source no longer selected.
    for (const path of [...this.files.keys()]) if (!seen.has(path)) this.files.delete(path);
    return { found, entries: dedupeEntries([...this.files.values()].flatMap((state) => state.entries), since) };
  }

  private async refresh(path: string, size: number, since: number): Promise<void> {
    const previous = this.files.get(path);
    // A file that shrank was rewritten, so start it over.
    let state: FileState = previous && size >= previous.size ? previous : { size: 0, offset: 0, entries: [] };
    if (size > state.offset) {
      try {
        const read = await readEntries(path, state.offset, size);
        state = { size, offset: read.offset, entries: [...state.entries, ...read.entries] };
      } catch {
        // A file being written or locked right now is picked up on the next read.
        return;
      }
    }
    this.files.set(path, { ...state, size, entries: state.entries.filter((entry) => entry.at >= since) });
  }
}

/** Transcript files under `root` touched since `since`, or null when `root` doesn't exist. */
async function listTranscripts(root: string, since: number): Promise<{ path: string; size: number }[] | null> {
  try {
    if (!(await stat(root)).isDirectory()) return null;
  } catch {
    return null;
  }
  const found: { path: string; size: number }[] = [];
  const walk = async (directory: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const info = await stat(path);
          if (info.mtimeMs >= since) found.push({ path, size: info.size });
        } catch {
          // Deleted between the listing and the stat.
        }
      }
    }
  };
  await walk(root, 0);
  return found;
}

/** Entries on the complete lines in [from, to), and the offset just past the last of them. */
async function readEntries(path: string, from: number, to: number): Promise<{ entries: UsageEntry[]; offset: number }> {
  const handle = await open(path, "r");
  try {
    const entries: UsageEntry[] = [];
    let offset = from;
    let position = from;
    let pending = Buffer.alloc(0);
    while (position < to) {
      const length = Math.min(READ_CHUNK_BYTES, to - position);
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await handle.read(chunk, 0, length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      // Split on the newline byte, not on decoded text, so a character straddling two chunks survives.
      const data = pending.length ? Buffer.concat([pending, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
      let start = 0;
      for (let newline = data.indexOf(0x0a); newline !== -1; newline = data.indexOf(0x0a, start)) {
        const entry = parseTranscriptLine(data.toString("utf8", start, newline));
        if (entry) entries.push(entry);
        start = newline + 1;
      }
      offset += start;
      pending = Buffer.from(data.subarray(start));
    }
    return { entries, offset };
  } finally {
    await handle.close();
  }
}

/** How a window's usage splits between models, by API-equivalent cost. `percent` is the window's
 * usage of its limit; each model gets its share of it. */
export function shareModels(entries: UsageEntry[], percent: number | null): ModelShare[] {
  const byModel = new Map<string, { cost: number; replies: number }>();
  for (const entry of entries) {
    const bucket = byModel.get(entry.model) ?? { cost: 0, replies: 0 };
    bucket.cost += entry.cost;
    bucket.replies += 1;
    byModel.set(entry.model, bucket);
  }
  const totalCost = [...byModel.values()].reduce((sum, bucket) => sum + bucket.cost, 0);
  const totalReplies = entries.length;
  return [...byModel.entries()]
    .map(([model, bucket]) => {
      // Replies with no token counts at all still say which model ran.
      const share = totalCost > 0 ? bucket.cost / totalCost : bucket.replies / Math.max(1, totalReplies);
      return { model, share, percent: percent === null ? null : share * percent, replies: bucket.replies };
    })
    .sort((left, right) => right.share - left.share);
}

function peakSession(samples: HistorySample[], from: number, to: number): number | null {
  let peak: number | null = null;
  for (const sample of samples) {
    const at = Date.parse(sample.at);
    if (at >= from && at < to) peak = Math.max(peak ?? 0, sample.session);
  }
  return peak;
}

/**
 * Session windows over the last seven days, newest first. The open window comes from Anthropic's
 * own reset time; earlier ones are rebuilt from the transcripts the way Anthropic opens them: the
 * first reply after a window ends starts a new five hours, from the top of that hour.
 */
export function sessionWindows(entries: UsageEntry[], usage: Usage, samples: HistorySample[], now: number): ModelWindow[] {
  const live = findWindow(usage, "session");
  const liveEnd = live?.resetsAt ? Date.parse(live.resetsAt) : Number.NaN;
  const liveStart = live && Number.isFinite(liveEnd) && liveEnd > now ? liveEnd - SESSION_MS : null;

  const built: { start: number; end: number; entries: UsageEntry[] }[] = [];
  for (const entry of entries) {
    if (liveStart !== null && entry.at >= liveStart) break;
    const current = built[built.length - 1];
    if (current && entry.at < current.end) {
      current.entries.push(entry);
      continue;
    }
    const start = Math.floor(entry.at / HOUR_MS) * HOUR_MS;
    built.push({ start, end: start + SESSION_MS, entries: [entry] });
  }

  const windows: ModelWindow[] = built.map((window) => {
    const end = liveStart === null ? window.end : Math.min(window.end, liveStart);
    const percent = peakSession(samples, window.start, end);
    return {
      start: new Date(window.start).toISOString(),
      end: new Date(end).toISOString(),
      active: end > now,
      percent: percent === null ? null : clampPercent(percent),
      models: shareModels(window.entries, percent)
    };
  });

  if (live && liveStart !== null) {
    const inside = entries.filter((entry) => entry.at >= liveStart);
    if (inside.length > 0 || live.percent > 0) {
      windows.push({
        start: new Date(liveStart).toISOString(),
        end: new Date(liveEnd).toISOString(),
        active: true,
        percent: clampPercent(live.percent),
        models: shareModels(inside, live.percent)
      });
    }
  }

  return windows
    .filter((window) => Date.parse(window.end) > now - WEEK_MS)
    .reverse()
    .slice(0, MODEL_SESSIONS_SHOWN);
}

/** The weekly window as Anthropic reports it, or the last seven days when it doesn't. */
export function weekWindow(entries: UsageEntry[], usage: Usage, now: number): ModelWindow {
  const live = findWindow(usage, "week");
  const liveEnd = live?.resetsAt ? Date.parse(live.resetsAt) : Number.NaN;
  const known = live && Number.isFinite(liveEnd) && liveEnd > now;
  const start = known ? liveEnd - WEEK_MS : now - WEEK_MS;
  const percent = known ? clampPercent(live.percent) : null;
  return {
    start: new Date(start).toISOString(),
    end: new Date(known ? liveEnd : now).toISOString(),
    active: true,
    percent,
    models: shareModels(entries.filter((entry) => entry.at >= start), percent)
  };
}

export function summarizeModels(
  found: boolean,
  entries: UsageEntry[],
  usage: Usage,
  samples: HistorySample[],
  now = Date.now()
): ModelUsageSummary {
  return {
    logsFound: found,
    week: weekWindow(entries, usage, now),
    sessions: sessionWindows(entries, usage, samples, now)
  };
}
