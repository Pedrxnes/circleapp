import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART_HEIGHT,
  CHART_PADDING,
  axisTicks,
  chartSpan,
  fractionAt,
  fractionFromPointer,
  nearestSampleIndex,
  peakIndex,
  plotY
} from "../shared/chart";
import type { HistorySample } from "../shared/types";

const samples: HistorySample[] = [
  { at: "2026-09-09T08:00:00Z", session: 10, week: 20 },
  { at: "2026-09-09T09:00:00Z", session: 62, week: 24 },
  { at: "2026-09-09T10:00:00Z", session: 41, week: 31 }
];

test("chartSpan covers the readings and widens a single instant", () => {
  assert.deepEqual(chartSpan(samples), {
    from: Date.parse("2026-09-09T08:00:00Z"),
    to: Date.parse("2026-09-09T10:00:00Z")
  });
  const single = chartSpan([samples[0]!]);
  assert.equal(single.to - single.from, 1);
  assert.deepEqual(chartSpan([]), { from: 0, to: 1 });
});

test("fractionAt places a timestamp inside the span and clamps outside it", () => {
  const span = chartSpan(samples);
  assert.equal(fractionAt(Date.parse("2026-09-09T09:00:00Z"), span), 0.5);
  assert.equal(fractionAt(Date.parse("2026-09-08T00:00:00Z"), span), 0);
  assert.equal(fractionAt(Date.parse("2026-09-10T00:00:00Z"), span), 1);
});

test("plotY maps percentages onto the padded plot, full at the top", () => {
  assert.equal(plotY(100), CHART_PADDING);
  assert.equal(plotY(0), CHART_HEIGHT - CHART_PADDING);
  assert.equal(plotY(150), CHART_PADDING);
});

test("fractionFromPointer undoes the plot padding", () => {
  assert.equal(fractionFromPointer(0), 0);
  assert.equal(fractionFromPointer(1), 1);
  assert.ok(Math.abs(fractionFromPointer(0.5) - 0.5) < 1e-9);
});

test("nearestSampleIndex picks the reading closest to the pointer", () => {
  const span = chartSpan(samples);
  assert.equal(nearestSampleIndex(samples, span, 0), 0);
  assert.equal(nearestSampleIndex(samples, span, 0.4), 1);
  assert.equal(nearestSampleIndex(samples, span, 1), 2);
  assert.equal(nearestSampleIndex([], span, 0.5), -1);
});

test("peakIndex finds the highest reading of each window", () => {
  assert.equal(peakIndex(samples, "session"), 1);
  assert.equal(peakIndex(samples, "week"), 2);
  assert.equal(peakIndex([], "session"), -1);
});

test("axisTicks spreads labels evenly from the first reading to the last", () => {
  const span = chartSpan(samples);
  const ticks = axisTicks(span, 5);
  assert.equal(ticks.length, 5);
  assert.equal(ticks[0], span.from);
  assert.equal(ticks[4], span.to);
  assert.equal(ticks[2], Date.parse("2026-09-09T09:00:00Z"));
});
