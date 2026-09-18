import assert from "node:assert/strict";
import test from "node:test";
import { chooseSource, isExpired, parseCredentials, parseUsage, sourceLabel } from "../main/claude";

test("parseCredentials reads Claude Code's OAuth block", () => {
  const parsed = parseCredentials(JSON.stringify({ claudeAiOauth: { accessToken: "token", expiresAt: 1234 } }));
  assert.deepEqual(parsed, { accessToken: "token", expiresAt: 1234 });
});

test("parseCredentials rejects malformed or empty files", () => {
  assert.equal(parseCredentials("not json"), null);
  assert.equal(parseCredentials("{}"), null);
  assert.equal(parseCredentials(JSON.stringify({ claudeAiOauth: {} })), null);
});

test("isExpired allows a minute of clock skew", () => {
  const now = 1_000_000;
  assert.equal(isExpired({ accessToken: "t", expiresAt: null }, now), false);
  assert.equal(isExpired({ accessToken: "t", expiresAt: now - 30_000 }, now), false);
  assert.equal(isExpired({ accessToken: "t", expiresAt: now - 120_000 }, now), true);
});

test("parseUsage maps the API windows Circle displays", () => {
  const windows = parseUsage(JSON.stringify({
    five_hour: { utilization: 42.5, resets_at: "2026-09-09T18:00:00Z" },
    seven_day: { utilization: 18, resets_at: "2026-09-14T00:00:00Z" },
    seven_day_opus: { utilization: 4 }
  }));
  assert.deepEqual(windows, [
    { key: "session", percent: 42.5, resetsAt: "2026-09-09T18:00:00Z" },
    { key: "week", percent: 18, resetsAt: "2026-09-14T00:00:00Z" },
    { key: "weekOpus", percent: 4, resetsAt: null }
  ]);
});

test("parseUsage skips windows the API did not report and clamps the rest", () => {
  const windows = parseUsage(JSON.stringify({ five_hour: { utilization: 140 }, seven_day: {} }));
  assert.deepEqual(windows, [{ key: "session", percent: 100, resetsAt: null }]);
});

test("chooseSource prefers the host when nothing is saved", () => {
  assert.deepEqual(chooseSource({ host: true, wsl: [{ distro: "Ubuntu", present: true }] }, null), { location: "host" });
});

test("chooseSource falls back to WSL when the host has no credentials", () => {
  assert.deepEqual(
    chooseSource({ host: false, wsl: [{ distro: "Debian", present: false }, { distro: "Ubuntu", present: true }] }, null),
    { location: "wsl", distro: "Ubuntu" }
  );
});

test("chooseSource honours a saved choice that is still available", () => {
  const info = { host: true, wsl: [{ distro: "Ubuntu", present: true }] };
  assert.deepEqual(chooseSource(info, { location: "wsl", distro: "Ubuntu" }), { location: "wsl", distro: "Ubuntu" });
});

test("chooseSource replaces a saved choice that disappeared", () => {
  const info = { host: true, wsl: [{ distro: "Ubuntu", present: false }] };
  assert.deepEqual(chooseSource(info, { location: "wsl", distro: "Ubuntu" }), { location: "host" });
  assert.equal(chooseSource({ host: false, wsl: [] }, { location: "host" }), null);
});

test("sourceLabel names the distro so Settings can show the active source", () => {
  assert.equal(sourceLabel({ location: "wsl", distro: "Ubuntu" }), "WSL · Ubuntu");
  assert.equal(sourceLabel({ location: "host" }), "Windows");
  assert.equal(sourceLabel(null), null);
});
