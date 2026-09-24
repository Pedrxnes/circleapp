import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { MAX_CONVERSATIONS, SESSION_WINDOW_HOURS, findWindow } from "../shared/types";
import type { ConversationUsage, ModelUsage, SessionModels, Usage } from "../shared/types";

/** One API response Claude Code logged in a transcript. */
export interface TranscriptEntry {
  /** Message id: Claude Code writes one line per content block, all sharing it. */
  key: string;
  at: number;
  model: string;
  sessionId: string;
  cwd: string | null;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const SESSION_WINDOW_MS = SESSION_WINDOW_HOURS * 3_600_000;
/** projects/<project>/<session>.jsonl is depth 1; subagent logs sit at <session>/subagents/*.jsonl. */
const MAX_DEPTH = 3;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** An assistant line with a model and token usage, or null for anything else. */
export function parseTranscriptLine(line: string): TranscriptEntry | null {
  // Most lines are user turns, tool results and bookkeeping; skip them before paying for JSON.parse.
  if (!line.includes('"assistant"') || !line.includes('"usage"')) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.type !== "assistant") return null;
  const message = record.message as Record<string, unknown> | undefined;
  if (typeof message !== "object" || message === null) return null;
  const model = message.model;
  // Claude Code logs locally generated messages (errors, interruptions) as "<synthetic>".
  if (typeof model !== "string" || !model || model.startsWith("<")) return null;
  const usage = message.usage as Record<string, unknown> | undefined;
  if (typeof usage !== "object" || usage === null) return null;
  const at = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const key = typeof message.id === "string" ? message.id : typeof record.uuid === "string" ? record.uuid : null;
  if (!key) return null;
  return {
    key,
    at,
    model,
    sessionId: typeof record.sessionId === "string" ? record.sessionId : "",
    cwd: typeof record.cwd === "string" ? record.cwd : null,
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens)
  };
}

export function parseTranscript(text: string): TranscriptEntry[] {
  return text.split("\n").flatMap((line) => {
    const entry = parseTranscriptLine(line);
    return entry ? [entry] : [];
  });
}

/** Start of the current session window: five hours before its reset, or the last five hours when none is reported. */
export function sessionWindowStart(usage: Usage, now = Date.now()): number {
  const resetsAt = Date.parse(findWindow(usage, "session")?.resetsAt ?? "");
  if (Number.isFinite(resetsAt) && resetsAt > now) return resetsAt - SESSION_WINDOW_MS;
  return now - SESSION_WINDOW_MS;
}

/** Last folder of a POSIX or Windows path. */
export function projectName(cwd: string | null): string | null {
  if (!cwd) return null;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

interface Tally { input: number; output: number; cacheWrite: number; cacheRead: number; messages: number; }

function emptyTally(): Tally {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: 0 };
}

function add(tally: Tally, entry: TranscriptEntry): void {
  tally.input += entry.input;
  tally.output += entry.output;
  tally.cacheWrite += entry.cacheWrite;
  tally.cacheRead += entry.cacheRead;
  tally.messages += 1;
}

function tallyTotal(tally: Tally): number {
  return tally.input + tally.output + tally.cacheWrite + tally.cacheRead;
}

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Models largest first, each with its share of `whole`. */
function toModels(byModel: Map<string, Tally>, whole: number): ModelUsage[] {
  return [...byModel.entries()]
    .map(([model, tally]) => {
      const total = tallyTotal(tally);
      return { model, ...tally, total, share: share(total, whole) };
    })
    .filter((model) => model.total > 0)
    .sort((left, right) => right.total - left.total || left.model.localeCompare(right.model));
}

/** Per-model and per-conversation token totals for the responses logged in [from, to]. */
export function summarizeModels(entries: Iterable<TranscriptEntry>, from: number, to: number): SessionModels {
  // A message is logged once per content block, and resumed conversations copy earlier turns into a
  // new file; keeping the last line per id counts each response once, with its final usage.
  const unique = new Map<string, TranscriptEntry>();
  for (const entry of entries) {
    if (entry.at >= from && entry.at <= to) unique.set(entry.key, entry);
  }

  const byModel = new Map<string, Tally>();
  const bySession = new Map<string, { cwd: string | null; first: number; last: number; models: Map<string, Tally> }>();
  for (const entry of unique.values()) {
    const modelTally = byModel.get(entry.model) ?? emptyTally();
    add(modelTally, entry);
    byModel.set(entry.model, modelTally);

    const session = bySession.get(entry.sessionId) ?? { cwd: entry.cwd, first: entry.at, last: entry.at, models: new Map() };
    session.cwd = session.cwd ?? entry.cwd;
    session.first = Math.min(session.first, entry.at);
    session.last = Math.max(session.last, entry.at);
    const sessionTally = session.models.get(entry.model) ?? emptyTally();
    add(sessionTally, entry);
    session.models.set(entry.model, sessionTally);
    bySession.set(entry.sessionId, session);
  }

  const total = [...byModel.values()].reduce((sum, tally) => sum + tallyTotal(tally), 0);
  const models = toModels(byModel, total);

  const conversations: ConversationUsage[] = [...bySession.entries()]
    .map(([sessionId, session]) => {
      const sessionTotal = [...session.models.values()].reduce((sum, tally) => sum + tallyTotal(tally), 0);
      return {
        sessionId,
        project: projectName(session.cwd),
        startedAt: new Date(session.first).toISOString(),
        lastActiveAt: new Date(session.last).toISOString(),
        total: sessionTotal,
        share: share(sessionTotal, total),
        models: toModels(session.models, sessionTotal)
      };
    })
    .filter((conversation) => conversation.total > 0)
    .sort((left, right) => Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt))
    .slice(0, MAX_CONVERSATIONS);

  return { windowStart: new Date(from).toISOString(), windowEnd: new Date(to).toISOString(), total, models, conversations };
}

interface CachedFile {
  size: number;
  mtimeMs: number;
  /** Bytes consumed so far; always just past a newline, so a half-written last line is re-read next time. */
  offset: number;
  entries: TranscriptEntry[];
}

/**
 * Reads Claude Code's transcripts under `projects/`, keeping what it parsed per
 * file. Transcripts are append-only, so a refresh reads only the bytes added
 * since the last one, and files untouched since the window opened are skipped.
 */
export class TranscriptReader {
  private readonly files = new Map<string, CachedFile>();
  private root: string | null = null;

  /** Entries logged at or after `since`, or null when `root` cannot be read. */
  async read(root: string, since: number): Promise<TranscriptEntry[] | null> {
    if (root !== this.root) {
      this.files.clear();
      this.root = root;
    }
    try {
      if (!(await stat(root)).isDirectory()) return null;
    } catch {
      return null;
    }
    const paths = await listTranscripts(root, 0);
    const live = new Set<string>();
    const entries: TranscriptEntry[] = [];
    for (const path of paths) {
      try {
        const info = await stat(path);
        if (info.mtimeMs < since) continue;
        live.add(path);
        const cached = await this.update(path, info.size, info.mtimeMs, since);
        entries.push(...cached.entries);
      } catch {
        // A transcript that vanished or is locked mid-write is picked up on the next refresh.
      }
    }
    for (const path of this.files.keys()) if (!live.has(path)) this.files.delete(path);
    return entries;
  }

  private async update(path: string, size: number, mtimeMs: number, since: number): Promise<CachedFile> {
    let cached = this.files.get(path);
    // A file that shrank was rewritten, so start over.
    if (!cached || size < cached.offset) cached = { size: 0, mtimeMs: 0, offset: 0, entries: [] };
    if (size !== cached.size || mtimeMs !== cached.mtimeMs) {
      const { text, consumed } = await readFrom(path, cached.offset, size);
      cached = {
        size,
        mtimeMs,
        offset: cached.offset + consumed,
        entries: [...cached.entries, ...parseTranscript(text)]
      };
    }
    // The window only moves forward, so anything before it will never be needed again.
    cached.entries = cached.entries.filter((entry) => entry.at >= since);
    this.files.set(path, cached);
    return cached;
  }
}

async function listTranscripts(directory: string, depth: number): Promise<string[]> {
  let names;
  try {
    names = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of names) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith(".jsonl") && depth > 0) found.push(path);
    else if (entry.isDirectory() && depth < MAX_DEPTH && entry.name !== "tool-results") {
      found.push(...(await listTranscripts(path, depth + 1)));
    }
  }
  return found;
}

/** Text from `offset` up to the last complete line before `size`, and how many bytes that was. */
async function readFrom(path: string, offset: number, size: number): Promise<{ text: string; consumed: number }> {
  const length = size - offset;
  if (length <= 0) return { text: "", consumed: 0 };
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    // Cutting at a newline byte never splits a UTF-8 sequence.
    const end = buffer.lastIndexOf(0x0a, bytesRead - 1);
    if (end < 0) return { text: "", consumed: 0 };
    return { text: buffer.toString("utf8", 0, end + 1), consumed: end + 1 };
  } finally {
    await handle.close();
  }
}
