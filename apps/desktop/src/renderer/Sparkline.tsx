import type { JSX, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useMemo, useState } from "react";
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  axisTicks,
  chartSpan,
  fractionAt,
  fractionFromPointer,
  leftPercent,
  nearestSampleIndex,
  peakIndex,
  plotX,
  plotY,
  topPercent
} from "../shared/chart";
import { strings } from "../shared/i18n";
import type { ChartSpan } from "../shared/chart";
import type { HistorySample, Language } from "../shared/types";
import { formatAxisTick, formatSampleStamp, metricLabel } from "./format";

const Y_TICKS = [100, 75, 50, 25, 0];
const X_TICK_COUNT = 5;
/** Above this the tooltip would sit on top of the traces, so it moves below them. */
const TIP_FLIP_PERCENT = 55;
/** Past this point across the plot the tooltip opens to the left of the cursor. */
const TIP_FLIP_SIDE_PERCENT = 58;

function trace(samples: HistorySample[], pick: (sample: HistorySample) => number, span: ChartSpan): string {
  return samples
    .map((sample, index) => {
      const x = plotX(fractionAt(Date.parse(sample.at), span));
      const y = plotY(pick(sample));
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface SparklineProps {
  samples: HistorySample[];
  accent: string;
  language: Language;
}

/** Two overlaid traces of the last week of readings, session and weekly usage,
 * with percentage labels down the side, timestamps underneath and a hover
 * readout that names the exact reading under the pointer. */
export function Sparkline({ samples, accent, language }: SparklineProps): JSX.Element {
  const text = strings(language);
  const sessionLabel = metricLabel("session", language);
  const weekLabel = metricLabel("week", language);

  const sorted = useMemo(
    () => [...samples].sort((left, right) => Date.parse(left.at) - Date.parse(right.at)),
    [samples]
  );
  const span = useMemo(() => chartSpan(sorted), [sorted]);
  const spanMs = span.to - span.from;
  const ticks = useMemo(() => axisTicks(span, X_TICK_COUNT), [span]);
  const peaks = useMemo(
    () => [
      { key: "session" as const, index: peakIndex(sorted, "session"), label: sessionLabel },
      { key: "week" as const, index: peakIndex(sorted, "week"), label: weekLabel }
    ],
    [sorted, sessionLabel, weekLabel]
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered === null ? null : sorted[hovered] ?? null;
  const activeLeft = active ? leftPercent(fractionAt(Date.parse(active.at), span)) : 0;

  const track = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const index = nearestSampleIndex(sorted, span, fractionFromPointer((event.clientX - rect.left) / rect.width));
    setHovered(index < 0 ? null : index);
  };

  // Arrow keys walk the readings so the chart is readable without a pointer.
  const step = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const last = sorted.length - 1;
    const moves: Record<string, number | "first" | "last"> = { ArrowLeft: -1, ArrowRight: 1, Home: "first", End: "last" };
    if (event.key === "Escape") return setHovered(null);
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setHovered((current) => {
      if (move === "first") return 0;
      if (move === "last") return last;
      return Math.max(0, Math.min(last, (current ?? last) + move));
    });
  };

  return (
    <div className="chart">
      <div className="legend">
        <span><i style={{ background: accent }} />{sessionLabel}</span>
        <span><i className="legend-week" />{weekLabel}</span>
      </div>

      <div className="chart-grid">
        <div className="chart-axis-y" aria-hidden="true">
          {Y_TICKS.map((tick) => (
            <span key={tick} style={{ top: `${topPercent(tick)}%` }}>{tick}%</span>
          ))}
        </div>

        <div
          className="chart-plot"
          tabIndex={0}
          role="img"
          aria-label={`${sessionLabel} · ${weekLabel} — ${text.last7Days}`}
          onPointerMove={track}
          onPointerLeave={() => setHovered(null)}
          onPointerDown={track}
          onKeyDown={step}
          onBlur={() => setHovered(null)}
        >
          <svg className="sparkline" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            {Y_TICKS.filter((tick) => tick > 0 && tick < 100).map((tick) => (
              <line
                key={tick}
                x1={CHART_PADDING}
                x2={CHART_WIDTH - CHART_PADDING}
                y1={plotY(tick)}
                y2={plotY(tick)}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
            ))}
            {ticks.slice(1, -1).map((tick) => (
              <line
                key={tick}
                x1={plotX(fractionAt(tick, span))}
                x2={plotX(fractionAt(tick, span))}
                y1={CHART_PADDING}
                y2={CHART_HEIGHT - CHART_PADDING}
                stroke="currentColor"
                strokeOpacity={0.055}
                strokeWidth={1}
              />
            ))}
            <path d={trace(sorted, (sample) => sample.week, span)} fill="none" stroke="currentColor" strokeOpacity={0.38} strokeWidth={2} strokeLinejoin="round" />
            <path d={trace(sorted, (sample) => sample.session, span)} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />
          </svg>

          {/* Markers and the tooltip are HTML, not SVG: the plot is stretched
              horizontally, which would squash anything round drawn inside it. */}
          {peaks.map(({ key, index, label }) => {
            const sample = index < 0 ? null : sorted[index];
            if (!sample) return null;
            return (
              <span
                key={key}
                className={key === "session" ? "chart-peak" : "chart-peak chart-peak-week"}
                style={{
                  left: `${leftPercent(fractionAt(Date.parse(sample.at), span))}%`,
                  top: `${topPercent(sample[key])}%`,
                  ...(key === "session" ? { borderColor: accent } : {})
                }}
                title={`${text.peakLabel} · ${label} ${Math.round(sample[key])}% · ${formatSampleStamp(sample.at, language)}`}
              />
            );
          })}

          {active && (
            <>
              <span className="chart-cursor" style={{ left: `${activeLeft}%` }} />
              <span className="chart-dot" style={{ left: `${activeLeft}%`, top: `${topPercent(active.week)}%` }} />
              <span className="chart-dot chart-dot-session" style={{ left: `${activeLeft}%`, top: `${topPercent(active.session)}%`, background: accent }} />
              <div
                className={`chart-tip${Math.max(active.session, active.week) > TIP_FLIP_PERCENT ? " chart-tip-low" : ""}`}
                style={{
                  left: `${activeLeft}%`,
                  // Beside the cursor, never on top of it, and flipped before it
                  // would run past the right edge of the plot.
                  transform: activeLeft > TIP_FLIP_SIDE_PERCENT ? "translateX(-100%)" : "none",
                  marginLeft: activeLeft > TIP_FLIP_SIDE_PERCENT ? "-10px" : "10px"
                }}
              >
                <span className="chart-tip-stamp">{formatSampleStamp(active.at, language)}</span>
                <span className="chart-tip-row">
                  <i style={{ background: accent }} />{sessionLabel}<b>{Math.round(active.session)}%</b>
                </span>
                <span className="chart-tip-row">
                  <i className="legend-week" />{weekLabel}<b>{Math.round(active.week)}%</b>
                </span>
              </div>
            </>
          )}
        </div>

        <div className="chart-axis-x" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              style={{
                left: `${leftPercent(fractionAt(tick, span))}%`,
                transform: `translateX(${index === 0 ? 0 : index === ticks.length - 1 ? -100 : -50}%)`
              }}
            >
              {formatAxisTick(tick, language, spanMs)}
            </span>
          ))}
        </div>
      </div>

      <p className="chart-foot">
        {active
          ? `${formatSampleStamp(active.at, language)} · ${sessionLabel} ${Math.round(active.session)}% · ${weekLabel} ${Math.round(active.week)}%`
          : `${formatAxisTick(span.from, language, spanMs)} → ${formatAxisTick(span.to, language, spanMs)} · ${sorted.length} ${text.readings} · ${text.chartHover}`}
      </p>
    </div>
  );
}
