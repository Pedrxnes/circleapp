import { clampPercent } from "./types";
import type { HistorySample } from "./types";

/** Geometry of the seven-day trend chart. The SVG traces and the HTML overlay
 * that sits on top of them (axis labels, hover cursor, tooltip) position against
 * these numbers, so both have to agree on one coordinate system. */
export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 120;
export const CHART_PADDING = 6;

export interface ChartSpan {
  from: number;
  to: number;
}

/** Time range covered by the readings, widened when they all share one instant. */
export function chartSpan(samples: HistorySample[]): ChartSpan {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    const at = Date.parse(sample.at);
    if (!Number.isFinite(at)) continue;
    from = Math.min(from, at);
    to = Math.max(to, at);
  }
  if (!Number.isFinite(from)) return { from: 0, to: 1 };
  return { from, to: to > from ? to : from + 1 };
}

/** Where a timestamp sits inside the span, 0 at the left edge and 1 at the right. */
export function fractionAt(at: number, span: ChartSpan): number {
  return clamp01((at - span.from) / Math.max(1, span.to - span.from));
}

export function plotX(fraction: number): number {
  return CHART_PADDING + clamp01(fraction) * (CHART_WIDTH - CHART_PADDING * 2);
}

export function plotY(percent: number): number {
  return CHART_HEIGHT - CHART_PADDING - (clampPercent(percent) / 100) * (CHART_HEIGHT - CHART_PADDING * 2);
}

/** The same points as percentages of the plot box, so HTML overlays can be
 * placed without knowing how wide the SVG was stretched. */
export function leftPercent(fraction: number): number {
  return (plotX(fraction) / CHART_WIDTH) * 100;
}

export function topPercent(percent: number): number {
  return (plotY(percent) / CHART_HEIGHT) * 100;
}

/** Undoes the horizontal padding: `ratio` is where the pointer sits across the
 * whole plot, the result is where it sits inside the plotted span. */
export function fractionFromPointer(ratio: number): number {
  const x = clamp01(ratio) * CHART_WIDTH;
  return clamp01((x - CHART_PADDING) / (CHART_WIDTH - CHART_PADDING * 2));
}

/** Index of the reading closest in time to `fraction`, or -1 when there is none. */
export function nearestSampleIndex(samples: HistorySample[], span: ChartSpan, fraction: number): number {
  const target = span.from + clamp01(fraction) * (span.to - span.from);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    const at = Date.parse(sample.at);
    if (!Number.isFinite(at)) return;
    const distance = Math.abs(at - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Index of the highest reading of one window, the earliest one on a tie, or -1 when empty. */
export function peakIndex(samples: HistorySample[], key: "session" | "week"): number {
  let best = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  samples.forEach((sample, index) => {
    if (sample[key] > bestValue) {
      best = index;
      bestValue = sample[key];
    }
  });
  return best;
}

/** Evenly spaced timestamps across the span, for the labels under the plot. */
export function axisTicks(span: ChartSpan, count: number): number[] {
  const total = Math.max(2, Math.floor(count));
  return Array.from({ length: total }, (_unused, index) => span.from + ((span.to - span.from) * index) / (total - 1));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
