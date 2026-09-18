import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, normalizeSource, normalizeThresholds } from "../main/settings";
import { DEFAULT_SETTINGS } from "../shared/types";

test("normalizeSettings falls back to defaults for a corrupt file", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings("nonsense"), DEFAULT_SETTINGS);
});

test("normalizeSettings keeps valid values and repairs invalid ones", () => {
  const settings = normalizeSettings({
    orbSize: "huge",
    orbOpacity: 4,
    accentColor: "green",
    ringMetric: "week",
    refreshIntervalSeconds: 5,
    language: "fr",
    orbCenterX: 100.6,
    orbCenterY: "nope"
  });
  assert.equal(settings.orbSize, DEFAULT_SETTINGS.orbSize);
  assert.equal(settings.orbOpacity, 1);
  assert.equal(settings.accentColor, DEFAULT_SETTINGS.accentColor);
  assert.equal(settings.ringMetric, "week");
  assert.equal(settings.refreshIntervalSeconds, 60);
  assert.equal(settings.language, "en");
  assert.equal(settings.orbCenterX, 101);
  assert.equal(settings.orbCenterY, null);
});

test("normalizeSettings drops unknown keys", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, sneaky: "value" }) as unknown as Record<string, unknown>;
  assert.equal("sneaky" in settings, false);
});

test("normalizeThresholds sorts, de-duplicates and clamps", () => {
  assert.deepEqual(normalizeThresholds([90, 75, 90, 0, 130, 50]), [1, 50, 75, 90, 100]);
  assert.deepEqual(normalizeThresholds("not an array"), DEFAULT_SETTINGS.notificationThresholds);
});

test("normalizeSource accepts only complete choices", () => {
  assert.deepEqual(normalizeSource({ location: "host" }), { location: "host" });
  assert.deepEqual(normalizeSource({ location: "wsl", distro: "Ubuntu" }), { location: "wsl", distro: "Ubuntu" });
  assert.equal(normalizeSource({ location: "wsl" }), null);
  assert.equal(normalizeSource({ location: "elsewhere" }), null);
  assert.equal(normalizeSource(null), null);
});
