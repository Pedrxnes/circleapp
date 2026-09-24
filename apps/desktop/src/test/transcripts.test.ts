import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  TranscriptStore,
  dedupeEntries,
  parseTranscriptLine,
  sessionWindows,
  shareModels,
  summarizeModels,
  weekWindow,
  type UsageEntry
} from "../main/transcripts";
import type { Usage } from "../shared/types";

const HOUR = 3_600_000;
const now = Date.parse("2026-09-24T12:30:00Z");

function line(options: { id?: string; model?: string; at: number; output?: number; input?: number; type?: string; requestId?: string }): string {
  return JSON.stringify({
    type: options.type ?? "assistant",
    timestamp: new Date(options.at).toISOString(),
    requestId: options.requestId ?? "req_1",
    sessionId: "s",
    message: {
      id: options.id ?? "msg_1",
      role: "assistant",
      model: options.model ?? "claude-opus-4-1-20250805",
      content: [{ type: "text", text: "secret content" }],
      usage: {
        input_tokens: options.input ?? 10,
        output_tokens: options.output ?? 100,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 5000,
        cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 600 }
      }
    }
  });
}

function entry(model: string, at: number, cost: number, key: string | null = null): UsageEntry {
  return { at, model, key, cost, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
}

function usageWith(windows: Usage["windows"]): Usage {
  return { state: "ok", windows, accountEmail: null, updatedAt: null, error: null, sourceLabel: null };
}

test("parseTranscriptLine keeps model, time and tokens, and splits cache writes by TTL", () => {
  const parsed = parseTranscriptLine(line({ at: now }));
  assert.ok(parsed);
  assert.equal(parsed.model, "claude-opus-4-1-20250805");
  assert.equal(parsed.at, now);
  assert.equal(parsed.key, "msg_1:req_1");
  assert.deepEqual([parsed.input, parsed.output, parsed.cacheWrite5m, parsed.cacheWrite1h, parsed.cacheRead], [10, 100, 400, 600, 5000]);
  assert.ok(parsed.cost > 0);
  assert.equal("content" in parsed, false);
});

test("parseTranscriptLine ignores prompts, synthetic replies and broken lines", () => {
  assert.equal(parseTranscriptLine(JSON.stringify({ type: "user", message: { content: "hi" } })), null);
  assert.equal(parseTranscriptLine(line({ at: now, type: "user" })), null);
  assert.equal(parseTranscriptLine(line({ at: now, model: "<synthetic>" })), null);
  assert.equal(parseTranscriptLine("{\"usage\": broken"), null);
  assert.equal(parseTranscriptLine(""), null);
});

test("dedupeEntries keeps one copy per reply, preferring the one with the final output", () => {
  const partial = { ...entry("m", now, 1, "a"), output: 5 };
  const final = { ...entry("m", now, 2, "a"), output: 50 };
  const deduped = dedupeEntries([partial, final, entry("m", now - 1, 1), entry("m", now - 2, 1)]);
  assert.equal(deduped.length, 3);
  assert.equal(deduped.find((item) => item.key === "a")?.output, 50);
  assert.deepEqual(deduped.map((item) => item.at), [now - 2, now - 1, now]);
});

test("shareModels splits a window's percent by cost", () => {
  const shares = shareModels([entry("opus", now, 3), entry("sonnet", now, 1), entry("opus", now, 0)], 40);
  assert.deepEqual(shares.map((share) => [share.model, share.share, share.percent, share.replies]), [
    ["opus", 0.75, 30, 2],
    ["sonnet", 0.25, 10, 1]
  ]);
  assert.equal(shareModels([entry("opus", now, 1)], null)[0]?.percent, null);
});

test("sessionWindows takes the open window from Anthropic and rebuilds earlier ones hourly", () => {
  const entries = [
    entry("opus", now - 30 * HOUR + 17 * 60_000, 1), // the window opens at the top of this hour
    entry("sonnet", now - 27 * HOUR, 1),
    entry("haiku", now - 20 * HOUR, 1), // after that window closed: a new one
    entry("opus", now - HOUR, 2),
    entry("sonnet", now - 0.5 * HOUR, 2)
  ];
  const usage = usageWith([{ key: "session", percent: 40, resetsAt: new Date(now + 3 * HOUR).toISOString() }]);
  const samples = [
    { at: new Date(now - 28 * HOUR).toISOString(), session: 55, week: 10 },
    { at: new Date(now - 19 * HOUR).toISOString(), session: 12, week: 11 }
  ];
  const windows = sessionWindows(entries, usage, samples, now);
  assert.equal(windows.length, 3);

  const [live, second, first] = windows;
  assert.equal(live?.active, true);
  assert.equal(live?.percent, 40);
  assert.equal(live?.start, new Date(now - 2 * HOUR).toISOString());
  assert.deepEqual(live?.models.map((model) => [model.model, model.percent]), [["opus", 20], ["sonnet", 20]]);

  assert.equal(second?.percent, 12);
  assert.deepEqual(second?.models.map((model) => model.model), ["haiku"]);

  assert.equal(first?.active, false);
  assert.equal(first?.percent, 55);
  assert.equal(Date.parse(first!.start) % HOUR, 0);
  assert.equal(Date.parse(first!.end) - Date.parse(first!.start), 5 * HOUR);
  assert.deepEqual(first?.models.map((model) => [model.model, model.percent]), [["opus", 27.5], ["sonnet", 27.5]]);
});

test("sessionWindows keeps an open window with usage but no local replies", () => {
  const usage = usageWith([{ key: "session", percent: 22, resetsAt: new Date(now + HOUR).toISOString() }]);
  const [live] = sessionWindows([], usage, [], now);
  assert.equal(live?.percent, 22);
  assert.deepEqual(live?.models, []);
  assert.deepEqual(sessionWindows([], usageWith([]), [], now), []);
});

test("sessionWindows drops windows older than a week and leaves percent unknown without readings", () => {
  const windows = sessionWindows([entry("opus", now - 9 * 24 * HOUR, 1), entry("opus", now - 3 * HOUR, 1)], usageWith([]), [], now);
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.active, true);
  assert.equal(windows[0]?.percent, null);
  assert.equal(windows[0]?.models[0]?.share, 1);
});

test("weekWindow uses Anthropic's weekly window, or the last seven days without it", () => {
  const entries = [entry("opus", now - 6 * 24 * HOUR, 1), entry("sonnet", now - HOUR, 3)];
  const usage = usageWith([{ key: "week", percent: 20, resetsAt: new Date(now + 2 * 24 * HOUR).toISOString() }]);
  const week = weekWindow(entries, usage, now);
  // The window opened five days ago, so the six-day-old reply is outside it.
  assert.deepEqual(week.models.map((model) => [model.model, model.percent]), [["sonnet", 20]]);

  const fallback = weekWindow(entries, usageWith([]), now);
  assert.equal(fallback.percent, null);
  assert.deepEqual(fallback.models.map((model) => [model.model, model.share]), [["sonnet", 0.75], ["opus", 0.25]]);
});

test("summarizeModels reports whether logs were found", () => {
  const summary = summarizeModels(false, [], usageWith([]), [], now);
  assert.equal(summary.logsFound, false);
  assert.deepEqual(summary.sessions, []);
});

test("TranscriptStore reads nested logs, dedupes across files and only reads what was appended", async () => {
  const root = mkdtempSync(join(tmpdir(), "circle-transcripts-"));
  const project = join(root, "C--code-app");
  mkdirSync(join(project, "session", "subagents"), { recursive: true });
  const main = join(project, "session.jsonl");
  const recent = Date.now() - HOUR;
  writeFileSync(main, `${line({ id: "a", at: recent })}\n${line({ id: "a", at: recent, output: 200 })}\n{"type":"user"}\n`);
  // A resumed session copies earlier replies into a new file.
  writeFileSync(join(project, "resumed.jsonl"), `${line({ id: "a", at: recent, output: 200 })}\n`);
  writeFileSync(join(project, "session", "subagents", "agent-1.jsonl"), `${line({ id: "b", model: "claude-haiku-4-5", at: recent })}\n`);
  // Untouched for weeks: skipped without being read.
  const stale = join(project, "old.jsonl");
  writeFileSync(stale, `${line({ id: "c", at: recent })}\n`);
  const old = new Date(Date.now() - 30 * 24 * HOUR);
  utimesSync(stale, old, old);

  const store = new TranscriptStore(async () => [join(root, "missing"), root]);
  const first = await store.read();
  assert.equal(first.found, true);
  assert.deepEqual(first.entries.map((item) => [item.key, item.output]).sort(), [["a:req_1", 200], ["b:req_1", 100]]);

  // Half a line is left for the next read, then completed.
  const next = line({ id: "d", model: "claude-sonnet-4-5", at: recent + 1000 });
  appendFileSync(main, next.slice(0, 40));
  assert.equal((await store.read()).entries.length, 2);
  appendFileSync(main, `${next.slice(40)}\n`);
  assert.deepEqual((await store.read()).entries.map((item) => item.model).sort(), ["claude-haiku-4-5", "claude-opus-4-1-20250805", "claude-sonnet-4-5"]);
});

test("TranscriptStore reports no logs when no root exists", async () => {
  const store = new TranscriptStore(async () => [join(tmpdir(), "circle-definitely-missing")]);
  assert.deepEqual(await store.read(), { found: false, entries: [] });
});
