import type { JSX } from "react";
import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { strings } from "../shared/i18n";
import {
  DEFAULT_SETTINGS,
  PANEL_GAP,
  PANEL_WIDTH,
  ringColor,
  ringPercent,
  secondaryMetric,
  findWindow
} from "../shared/types";
import type { OrbLayout, Settings, Usage } from "../shared/types";
import { Ring } from "./Ring";
import { formatReset, formatUpdated, metricHint, metricLabel } from "./format";
import "./orb.css";

const EMPTY_USAGE: Usage = { state: "no-credentials", windows: [], accountEmail: null, updatedAt: null, error: null, sourceLabel: null };
const DEFAULT_LAYOUT: OrbLayout = { boxWidth: 400, boxHeight: 300, orbDiameter: 72, centerX: 320, centerY: 150, anchor: "right" };
/** Pointer slack around the orb so a shaky hand does not close the panel. */
const HIT_SLACK = 6;
const PANEL_CLOSE_DELAY_MS = 180;
const DRAG_THRESHOLD_PX = 4;

function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE);
  const [layout, setLayout] = useState<OrbLayout>(DEFAULT_LAYOUT);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const interactive = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  // Dragging streams a new layout every frame; reading it through a ref keeps
  // the pointer listeners registered once instead of on every update.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    void window.circle.getState().then((state) => {
      setSettings(state.settings);
      setUsage(state.usage);
      setLayout(state.layout);
    });
    window.circle.onSettings(setSettings);
    window.circle.onUsage(setUsage);
    window.circle.onLayout(setLayout);
  }, []);

  const text = strings(settings.language);
  const percent = ringPercent(usage, settings.ringMetric);
  const secondaryKey = secondaryMetric(settings.ringMetric);
  const secondaryPercent = findWindow(usage, secondaryKey)?.percent ?? 0;
  const colour = usage.state === "ok" ? ringColor(percent, settings.colorMode, settings.accentColor) : "#8a8f98";

  /** Tell the main process whether the window should swallow clicks right now. */
  const setInteractive = useCallback((next: boolean) => {
    if (interactive.current === next) return;
    interactive.current = next;
    void window.circle.setInteractive(next);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), PANEL_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const endDrag = useCallback(async () => {
    const start = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    if (!start) return;
    await window.circle.endDrag();
  }, []);

  // The window is a mostly transparent box: hit-test the pointer against the
  // orb and the open panel, and hand clicks back to the desktop everywhere else.
  useEffect(() => {
    const overOrb = (x: number, y: number): boolean => {
      const current = layoutRef.current;
      return Math.hypot(x - current.centerX, y - current.centerY) <= current.orbDiameter / 2 + HIT_SLACK;
    };

    const overPanel = (x: number, y: number): boolean => {
      const panel = panelRef.current;
      if (!openRef.current || !panel) return false;
      const rect = panel.getBoundingClientRect();
      // Include the gap between orb and panel so crossing it never drops the hover.
      const anchoredRight = layoutRef.current.anchor === "right";
      const left = anchoredRight ? rect.left - PANEL_GAP : rect.left;
      const right = anchoredRight ? rect.right : rect.right + PANEL_GAP;
      return x >= left && x <= right && y >= rect.top - HIT_SLACK && y <= rect.bottom + HIT_SLACK;
    };

    const onMove = (event: MouseEvent): void => {
      // A move with no button held while dragging means the release was missed.
      if (dragStart.current && event.buttons === 0) void endDrag();
      if (dragStart.current) return;
      const inside = overOrb(event.clientX, event.clientY) || overPanel(event.clientX, event.clientY);
      setInteractive(inside);
      if (overOrb(event.clientX, event.clientY)) {
        cancelClose();
        setOpen(true);
      } else if (!inside) {
        closeSoon();
      } else {
        cancelClose();
      }
    };

    const onLeave = (): void => {
      if (dragStart.current) return;
      setInteractive(false);
      closeSoon();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [cancelClose, closeSoon, setInteractive, endDrag]);

  useEffect(() => cancelClose, [cancelClose]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragStart.current = { x: event.screenX, y: event.screenY };
    if (!settings.lockPosition) {
      setDragging(true);
      void window.circle.beginDrag();
    }
  }, [settings.lockPosition]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const moved = Math.hypot(event.screenX - start.x, event.screenY - start.y);
    void endDrag();
    // A press that barely moved is a click, not a drag.
    if (moved < DRAG_THRESHOLD_PX) void window.circle.openSettings();
  }, [endDrag]);

  const [panelHeight, setPanelHeight] = useState(0);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // contentRect excludes padding and border; measure the border box instead.
    const observer = new ResizeObserver(() => setPanelHeight(panel.getBoundingClientRect().height));
    observer.observe(panel);
    setPanelHeight(panel.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  const rows = usage.windows;
  // Centre the panel on the orb, then keep it inside the transparent box.
  const panelTop = Math.min(
    Math.max(layout.centerY - panelHeight / 2, 8),
    Math.max(8, layout.boxHeight - panelHeight - 8)
  );
  const orbStyle: React.CSSProperties = {
    left: layout.centerX,
    top: layout.centerY,
    width: layout.orbDiameter,
    height: layout.orbDiameter,
    opacity: open || dragging ? 1 : settings.orbOpacity,
    ["--orb-color" as string]: colour
  };
  const panelStyle: React.CSSProperties = {
    width: PANEL_WIDTH,
    top: panelTop,
    ...(layout.anchor === "right"
      ? { right: layout.boxWidth - layout.centerX + layout.orbDiameter / 2 + PANEL_GAP }
      : { left: layout.centerX + layout.orbDiameter / 2 + PANEL_GAP })
  };

  return (
    <div className="orb-root">
      <div
        className={`orb${dragging ? " orb-dragging" : ""}${open ? " orb-open" : ""}`}
        style={orbStyle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { void endDrag(); }}
        title={text.appName}
      >
        <Ring
          size={layout.orbDiameter}
          percent={usage.state === "ok" ? percent : 0}
          secondaryPercent={usage.state === "ok" ? secondaryPercent : 0}
          color={colour}
          thickness={Math.max(5, layout.orbDiameter * 0.11)}
        />
        <div className="orb-face">
          {usage.state === "ok"
            ? settings.showPercentLabel && <span className="orb-percent">{Math.round(percent)}<i>%</i></span>
            : <span className="orb-alert">!</span>}
        </div>
      </div>

      <div
        ref={panelRef}
        className={`panel panel-${layout.anchor}${open ? " panel-open" : ""}`}
        style={panelStyle}
        onPointerEnter={cancelClose}
      >
        <header className="panel-head">
          <span className="panel-title">{text.appName}</span>
          {usage.sourceLabel && <span className="panel-source">{usage.sourceLabel}</span>}
        </header>

        {usage.state === "ok" && rows.length > 0 && (
          <ul className="panel-rows">
            {rows.map((window) => {
              const rowColour = ringColor(window.percent, settings.colorMode, settings.accentColor);
              return (
                <li key={window.key} className="panel-row">
                  <div className="panel-row-head">
                    <span className="panel-row-label">{metricLabel(window.key, settings.language)}</span>
                    <span className="panel-row-value" style={{ color: rowColour }}>{Math.round(window.percent)}%</span>
                  </div>
                  <div className="panel-bar">
                    <span style={{ width: `${Math.max(2, window.percent)}%`, background: rowColour }} />
                  </div>
                  <div className="panel-row-foot">
                    <span>{metricHint(window.key, settings.language)}</span>
                    <span>{formatReset(window.resetsAt, settings.language)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {usage.state === "no-credentials" && (
          <div className="panel-message">
            <strong>{text.noCredentials}</strong>
            <span>{text.setupHint}</span>
          </div>
        )}

        {usage.state === "error" && (
          <div className="panel-message">
            <strong>{text.loadFailed}</strong>
            <span>{usage.error}</span>
          </div>
        )}

        <footer className="panel-foot">
          <span>{formatUpdated(usage.updatedAt, settings.language)}</span>
          <button type="button" onClick={() => { void window.circle.refresh(); }}>{text.refresh}</button>
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
