import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Usage } from "../shared/types";
import {
  TranscriptReader,
  parseTranscriptLine,
  projectName,
  sessionWindowStart,
  summarizeModels,
  type TranscriptEntry
} from "../main/transcripts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-24T15:00:00Z");

function line(options: {
  id: string;
  at: number;
  model?: string;
  session?: string;
  cwd?: string;
  usage?: Record<string, number>;
}): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: options.session ?? "s1",
    cwd: options.cwd ?? "/home/ana/circle",
    timestamp: new Date(options.at).toISOString(),
    message: {
      id: options.id,
      model: options.model ?? "claude-opus-4-1-20250805",
      usage: options.usage ?? { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 }
    }
  });
}

function entry(key: string, at: number, model: string, session: string, tokens: number): TranscriptEntry {
  return { key, at, model, sessionId: session, cwd: `/work/${session}`, input: tokens, output: 0, cacheWrite: 0, cacheRead: 0 };
}

test("parseTranscriptLine reads model, session and all four token counts", () => {
  const parsed = parseTranscriptLine(line({ id: "msg_1", at: NOW }));
  assert.deepEqual(parsed, {
    key: "msg_1",
    at: NOW,
    model: "claude-opus-4-1-20250805",
    sessionId: "s1",
    cwd: "/home/ana/circle",
    input: 10,
    output: 20,
    cacheWrite: 30,
    cacheRead: 40
  });
});

test("parseTranscriptLine skips user turns, synthetic messages and broken lines", () => {
  assert.equal(parseTranscriptLine(JSON.stringify({ type: "user", message: { content: "assistant usage" } })), null);
  assert.equal(parseTranscriptLine(line({ id: "x", at: NOW, model: "<synthetic>" })), null);
  assert.equal(parseTranscriptLine('{"type":"assistant","usage":'), null);
  assert.equal(parseTranscriptLine(""), null);
});

test("parseTranscriptLine treats missing or negative counts as zero", () => {
  const parsed = parseTranscriptLine(line({ id: "m", at: NOW, usage: { output_tokens: 5, input_tokens: -3 } }));
  assert.equal(parsed?.input, 0);
  assert.equal(parsed?.output, 5);
  assert.equal(parsed?.cacheRead, 0);
});

test("summarizeModels gives each model its share of the window's tokens", () => {
  const summary = summarizeModels([
    entry("a", NOW - HOUR, "claude-opus-4-1", "s1", 600),
    entry("b", NOW - HOUR, "claude-sonnet-4-5", "s1", 300),
    entry("c", NOW - HOUR, "claude-haiku-4-5", "s2", 100)
  ], NOW - 5 * HOUR, NOW);
  assert.equal(summary.total, 1000);
  assert.deepEqual(summary.models.map((model) => [model.model, model.share]), [
    ["claude-opus-4-1", 60],
    ["claude-sonnet-4-5", 30],
    ["claude-haiku-4-5", 10]
  ]);
});

test("summarizeModels counts a message logged on several lines once, with its last usage", () => {
  const summary = summarizeModels([
    entry("a", NOW - HOUR, "claude-opus-4-1", "s1", 100),
    entry("a", NOW - HOUR, "claude-opus-4-1", "s1", 150),
    entry("a", NOW - HOUR, "claude-opus-4-1", "resumed", 150)
  ], NOW - 5 * HOUR, NOW);
  assert.equal(summary.total, 150);
  assert.equal(summary.models[0]?.messages, 1);
});

test("summarizeModels ignores responses outside the window", () => {
  const summary = summarizeModels([
    entry("old", NOW - 6 * HOUR, "claude-opus-4-1", "s1", 999),
    entry("new", NOW - HOUR, "claude-sonnet-4-5", "s1", 10)
  ], NOW - 5 * HOUR, NOW);
  assert.equal(summary.total, 10);
  assert.deepEqual(summary.models.map((model) => model.model), ["claude-sonnet-4-5"]);
});

test("summarizeModels splits each conversation by model, most recent first", () => {
  const summary = summarizeModels([
    entry("a", NOW - 3 * HOUR, "claude-opus-4-1", "early", 300),
    entry("b", NOW - 2 * HOUR, "claude-haiku-4-5", "early", 100),
    entry("c", NOW - HOUR, "claude-sonnet-4-5", "late", 600)
  ], NOW - 5 * HOUR, NOW);
  assert.deepEqual(summary.conversations.map((conversation) => conversation.sessionId), ["late", "early"]);
  const early = summary.conversations[1]!;
  assert.equal(early.project, "early");
  assert.equal(early.total, 400);
  assert.equal(early.share, 40);
  assert.deepEqual(early.models.map((model) => [model.model, model.share]), [["claude-opus-4-1", 75], ["claude-haiku-4-5", 25]]);
  assert.equal(early.startedAt, new Date(NOW - 3 * HOUR).toISOString());
  assert.equal(early.lastActiveAt, new Date(NOW - 2 * HOUR).toISOString());
});

test("summarizeModels of nothing is an empty window, not a division by zero", () => {
  const summary = summarizeModels([], NOW - 5 * HOUR, NOW);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.models, []);
  assert.deepEqual(summary.conversations, []);
});

test("sessionWindowStart is five hours before the reset, or the last five hours without one", () => {
  const usage = (resetsAt: string | null): Usage => ({
    state: "ok",
    windows: [{ key: "session", percent: 40, resetsAt }],
    accountEmail: null,
    updatedAt: null,
    error: null,
    sourceLabel: null
  });
  assert.equal(sessionWindowStart(usage(new Date(NOW + 2 * HOUR).toISOString()), NOW), NOW - 3 * HOUR);
  assert.equal(sessionWindowStart(usage(null), NOW), NOW - 5 * HOUR);
  // A reset already in the past means the reading is stale; fall back rather than look into the future.
  assert.equal(sessionWindowStart(usage(new Date(NOW - HOUR).toISOString()), NOW), NOW - 5 * HOUR);
});

test("projectName takes the last folder of POSIX and Windows paths", () => {
  assert.equal(projectName("/home/ana/circle"), "circle");
  assert.equal(projectName("C:\\Users\\ana\\circle\\"), "circle");
  assert.equal(projectName(null), null);
});

test("TranscriptReader finds transcripts and subagent logs, and reads only appended lines", async () => {
  const root = mkdtempSync(join(tmpdir(), "circle-transcripts-"));
  try {
    const since = Date.now() - HOUR;
    const recent = Date.now() - 60_000;
    const project = join(root, "-home-ana-circle");
    mkdirSync(join(project, "s1", "subagents"), { recursive: true });
    const main = join(project, "s1.jsonl");
    writeFileSync(main, `${line({ id: "m1", at: recent })}\n${JSON.stringify({ type: "user" })}\n`);
    writeFileSync(join(project, "s1", "subagents", "agent-1.jsonl"), `${line({ id: "m2", at: recent, model: "claude-haiku-4-5" })}\n`);

    const reader = new TranscriptReader();
    const first = await reader.read(root, since);
    assert.deepEqual(first?.map((item) => item.key).sort(), ["m1", "m2"]);

    // A half-written line is left for the next read instead of being lost.
    const next = line({ id: "m3", at: recent });
    appendFileSync(main, next.slice(0, 20));
    assert.deepEqual((await reader.read(root, since))?.map((item) => item.key).sort(), ["m1", "m2"]);
    appendFileSync(main, `${next.slice(20)}\n`);
    assert.deepEqual((await reader.read(root, since))?.map((item) => item.key).sort(), ["m1", "m2", "m3"]);

    // A file untouched since the window opened is skipped entirely.
    const stale = join(project, "old.jsonl");
    writeFileSync(stale, `${line({ id: "old", at: recent })}\n`);
    const past = new Date(Date.now() - 2 * HOUR);
    utimesSync(stale, past, past);
    assert.ok(!(await reader.read(root, since))?.some((item) => item.key === "old"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TranscriptReader reports a missing folder as null", async () => {
  assert.equal(await new TranscriptReader().read(join(tmpdir(), "circle-does-not-exist-9f2c"), 0), null);
});
