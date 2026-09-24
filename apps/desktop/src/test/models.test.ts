import assert from "node:assert/strict";
import test from "node:test";
import { modelColors, modelFamily, modelLabel } from "../shared/models";

test("modelLabel turns API ids into short names", () => {
  assert.equal(modelLabel("claude-opus-4-1-20250805"), "Opus 4.1");
  assert.equal(modelLabel("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(modelLabel("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(modelLabel("claude-3-5-sonnet-20241022"), "Sonnet 3.5");
  assert.equal(modelLabel("claude-opus-4-20250514"), "Opus 4");
  assert.equal(modelLabel("claude-sonnet-4-5[1m]"), "Sonnet 4.5");
  assert.equal(modelLabel("us.anthropic.claude-sonnet-4-5-20250929-v1:0"), "Sonnet 4.5");
  assert.equal(modelLabel("claude-opus-4-1@20250805"), "Opus 4.1");
});

test("modelLabel leaves ids it cannot read untouched", () => {
  assert.equal(modelLabel("20250805"), "20250805");
});

test("modelFamily ignores version numbers wherever they sit", () => {
  assert.equal(modelFamily("claude-opus-4-1-20250805"), "opus");
  assert.equal(modelFamily("claude-3-5-sonnet-20241022"), "sonnet");
});

test("modelColors keeps a family's hue and lightens its later versions", () => {
  const colors = modelColors(["claude-opus-4-1", "claude-sonnet-4-5", "claude-opus-4", "mystery-model"]);
  assert.equal(colors["claude-opus-4-1"], "#d97757");
  assert.equal(colors["claude-sonnet-4-5"], "#0a84ff");
  assert.notEqual(colors["claude-opus-4"], colors["claude-opus-4-1"]);
  assert.match(colors["claude-opus-4"] ?? "", /^#[0-9a-f]{6}$/);
  assert.match(colors["mystery-model"] ?? "", /^#[0-9a-f]{6}$/);
});
