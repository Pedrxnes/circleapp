import type { JSX } from "react";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACCENT_LABEL_KEYS, strings } from "../shared/i18n";
import {
  ACCENT_PRESETS,
  DEFAULT_SETTINGS,
  MIN_REFRESH_INTERVAL_SECONDS,
  ORB_DIAMETERS,
  exhaustionWarnings,
  findWindow,
  isHexColor,
  ringColor,
  ringPercent,
  secondaryMetric
} from "../shared/types";
import type { AppInfo, HistorySummary, HistoryView, Language, SessionModels, Settings, SourceInfo, Usage } from "../shared/types";
import appIcon from "../../resources/icon.png";
import { Ring } from "./Ring";
import { Row, Section, Segmented, Slider, Toggle } from "./controls";
import { formatExhaustion, formatPeriodLabel, formatReset, formatUpdated, metricHint, metricLabel } from "./format";
import { Sparkline } from "./Sparkline";
import { WeeklyPace } from "./WeeklyPace";
import { ModelBreakdown } from "./ModelBreakdown";
import "./settings.css";

const EMPTY_USAGE: Usage = { state: "no-credentials", windows: [], accountEmail: null, updatedAt: null, error: null, sourceLabel: null };
const TABS = ["usage", "appearance", "behavior", "about"] as const;
type Tab = (typeof TABS)[number];

function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE);
  const [models, setModels] = useState<SessionModels | null>(null);
  const [history, setHistory] = useState<HistorySummary>({
    samples: [],
    peakSession: 0,
    peakWeek: 0,
    sessionRatePerHour: null,
    weekRatePerHour: null,
    projectedSessionExhaustion: null,
    projectedWeekExhaustion: null,
    rangeFrom: new Date().toISOString(),
    rangeTo: new Date().toISOString(),
    hasOlder: false,
    hasNewer: false,
    weekly: { days: [], dailyAverage: null, changeVsPreviousWeek: null, sessionsStarted: 0, sessionsNearLimit: 0 }
  });
  const [historyView, setHistoryView] = useState<HistoryView>("week");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [sources, setSources] = useState<SourceInfo | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loginItem, setLoginItem] = useState({ available: false, enabled: false });
  const [tab, setTab] = useState<Tab>("usage");
  const [refreshing, setRefreshing] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);

  const reload = useCallback(() => {
    void window.circle.getHistory(historyView, historyOffset).then(setHistory);
    void window.circle.getSources().then(setSources);
  }, [historyView, historyOffset]);

  const changeHistoryView = useCallback((view: HistoryView) => {
    setHistoryView(view);
    setHistoryOffset(0);
  }, []);

  useEffect(() => {
    void window.circle.getState().then((state) => {
      setSettings(state.settings);
      setUsage(state.usage);
      setModels(state.models);
    });
    void window.circle.getAppInfo().then(setInfo);
    void window.circle.getLoginItem().then(setLoginItem);
    window.circle.onSettings(setSettings);
    window.circle.onModels(setModels);
    window.circle.onUsage((next) => { setUsage(next); reload(); });
    reload();
  }, [reload]);

  const text = strings(settings.language);
  const patch = useCallback((update: Partial<Settings>) => {
    void window.circle.updateSettings(update).then(setSettings);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setUsage(await window.circle.refresh());
      reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  const warnings = exhaustionWarnings(usage, history);
  const percent = ringPercent(usage, settings.ringMetric);

  return (
    <div className="app">
      <header className="app-head">
        <div className="brand">
          <img className="brand-icon" src={appIcon} alt="" width={34} height={34} />
          <div>
            <h1>{text.appName}</h1>
            <p>{usage.sourceLabel ?? text.settingsTitle}</p>
          </div>
        </div>
        <button type="button" className="button" onClick={() => { void refresh(); }} disabled={refreshing}>
          {refreshing ? `${text.refresh}…` : text.refresh}
        </button>
      </header>

      <nav className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={entry === tab ? "tab tab-active" : "tab"}
            onClick={() => setTab(entry)}
          >
            {entry === "usage" ? text.tabUsage : entry === "appearance" ? text.tabAppearance : entry === "behavior" ? text.tabBehavior : text.tabAbout}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === "usage" && (
          <>
            <Section title={text.overview}>
              {usage.state === "ok" && usage.windows.length > 0 ? (
                <div className="cards">
                  {usage.windows.map((window) => {
                    const rowColour = ringColor(window.percent, settings.colorMode, settings.accentColor);
                    return (
                      <article key={window.key} className="card">
                        <Ring size={78} percent={window.percent} color={rowColour} thickness={8} />
                        <div className="card-text">
                          <span className="card-value" style={{ color: rowColour }}>{Math.round(window.percent)}%</span>
                          <span className="card-label">{metricLabel(window.key, settings.language)}</span>
                          <span className="card-hint">{metricHint(window.key, settings.language)}</span>
                          <span className="card-hint">{formatReset(window.resetsAt, settings.language)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="notice">
                  <strong>{usage.state === "no-credentials" ? text.noCredentials : text.loadFailed}</strong>
                  <span>{usage.state === "no-credentials" ? text.setupHint : usage.error ?? text.noUsageYet}</span>
                </div>
              )}
              <p className="muted">{formatUpdated(usage.updatedAt, settings.language)}</p>
            </Section>

            {usage.state !== "no-credentials" && (
              <Section title={text.modelsTitle} hint={text.modelsHint}>
                <ModelBreakdown models={models} language={settings.language} />
              </Section>
            )}

            {usage.state === "ok" && (
              <Section title={text.weeklyPaceTitle} hint={text.weeklyPaceHint}>
                <WeeklyPace usage={usage} history={history} language={settings.language} />
              </Section>
            )}

            <Section
              title={text.last7Days}
              hint={history.samples.length > 1
                ? `${text.peakInPeriod}: ${metricLabel("session", settings.language)} ${Math.round(history.peakSession)}% · ${metricLabel("week", settings.language)} ${Math.round(history.peakWeek)}%`
                : undefined}
            >
              <div className="history-toolbar">
                <Segmented
                  value={historyView}
                  onChange={changeHistoryView}
                  options={[
                    { value: "week", label: text.viewWeek },
                    { value: "month", label: text.viewMonth }
                  ]}
                />
                <div className="history-nav">
                  <button
                    type="button"
                    className="button-icon"
                    aria-label={text.prevPeriod}
                    onClick={() => setHistoryOffset((offset) => offset + 1)}
                    disabled={!history.hasOlder}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="history-period"
                    onClick={() => setHistoryOffset(0)}
                    disabled={historyOffset === 0}
                    title={text.currentPeriod}
                  >
                    {formatPeriodLabel(history.rangeFrom, history.rangeTo, historyView, settings.language)}
                  </button>
                  <button
                    type="button"
                    className="button-icon"
                    aria-label={text.nextPeriod}
                    onClick={() => setHistoryOffset((offset) => Math.max(0, offset - 1))}
                    disabled={!history.hasNewer}
                  >
                    ›
                  </button>
                </div>
              </div>
              {history.samples.length > 1
                ? <Sparkline samples={history.samples} accent={settings.accentColor} language={settings.language} />
                : <p className="muted">{historyOffset === 0 && historyView === "week" ? text.noHistoryYet : text.noHistoryPeriod}</p>}
            </Section>

            {historyOffset === 0 && history.samples.length > 1 && (
              <Section title={text.burnRateTitle} hint={text.burnRateHint}>
                {warnings.length > 0
                  ? warnings.map((warning) => (
                      <p key={warning.key} className="body">
                        <strong>{metricLabel(warning.key, settings.language)}:</strong> {formatExhaustion(warning.etaIso, settings.language)}
                      </p>
                    ))
                  : <p className="muted">{text.usageSteady}</p>}
              </Section>
            )}

            <Section title={text.source}>
              <div className="row row-stacked">
                <Segmented<string>
                  value={settings.source ? (settings.source.location === "wsl" ? `wsl:${settings.source.distro}` : "host") : "auto"}
                  options={[
                    { value: "auto", label: text.sourceAuto },
                    ...(sources?.host ? [{ value: "host", label: text.sourceHost }] : []),
                    ...(sources?.wsl.filter((entry) => entry.present).map((entry) => ({
                      value: `wsl:${entry.distro}`,
                      label: `${text.sourceWsl} · ${entry.distro}`
                    })) ?? [])
                  ]}
                  onChange={(value) => {
                    if (value === "auto") return patch({ source: null });
                    if (value === "host") return patch({ source: { location: "host" } });
                    return patch({ source: { location: "wsl", distro: value.slice(4) } });
                  }}
                />
              </div>
              {usage.accountEmail && <Row label={text.account} control={<span className="value">{usage.accountEmail}</span>} />}
            </Section>
          </>
        )}

        {tab === "appearance" && (
          <>
            <Section title={text.floatingOrb} hint={text.floatingOrbHint}>
              <Row label={text.enableOrb} control={<Toggle checked={settings.orbEnabled} onChange={(value) => patch({ orbEnabled: value })} />} />
              <Row
                label={text.hideOrbSetting}
                hint={text.hideOrbHint}
                control={<Toggle checked={settings.orbHidden} disabled={!settings.orbEnabled} onChange={(value) => patch({ orbHidden: value })} />}
              />
              <Row
                label={text.orbSize}
                control={
                  <Segmented
                    value={settings.orbSize}
                    options={[
                      { value: "small" as const, label: text.sizeSmall },
                      { value: "medium" as const, label: text.sizeMedium },
                      { value: "large" as const, label: text.sizeLarge }
                    ]}
                    onChange={(value) => patch({ orbSize: value })}
                  />
                }
              />
              <Row
                label={text.opacity}
                hint={text.opacityHint}
                control={
                  <Slider
                    value={Math.round(settings.orbOpacity * 100)}
                    min={25}
                    max={100}
                    step={5}
                    onChange={(value) => patch({ orbOpacity: value / 100 })}
                    format={(value) => `${value}%`}
                  />
                }
              />
              <Row
                label={text.showPercent}
                hint={text.showPercentHint}
                control={<Toggle checked={settings.showPercentLabel} onChange={(value) => patch({ showPercentLabel: value })} />}
              />
            </Section>

            <Section title={text.ringSection}>
              <Row
                label={text.ringColor}
                control={
                  <Segmented
                    value={settings.colorMode}
                    options={[
                      { value: "dynamic" as const, label: text.colorDynamic },
                      { value: "fixed" as const, label: text.colorFixed }
                    ]}
                    onChange={(value) => patch({ colorMode: value })}
                  />
                }
              />
              <p className="muted">{settings.colorMode === "dynamic" ? text.colorDynamicHint : text.colorFixedHint}</p>
              <div className="swatches">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={text[ACCENT_LABEL_KEYS[preset.id] ?? "customColor"]}
                    aria-label={text[ACCENT_LABEL_KEYS[preset.id] ?? "customColor"]}
                    className={`swatch${settings.accentColor.toLowerCase() === preset.hex ? " swatch-active" : ""}`}
                    style={{ background: preset.hex }}
                    onClick={() => patch({ accentColor: preset.hex, colorMode: "fixed" })}
                  />
                ))}
                <label className="swatch swatch-custom" title={text.customColor}>
                  <input
                    type="color"
                    value={isHexColor(settings.accentColor) ? settings.accentColor : "#d97757"}
                    onChange={(event) => patch({ accentColor: event.target.value, colorMode: "fixed" })}
                  />
                </label>
              </div>
              <Row
                label={text.ringMetric}
                hint={text.ringMetricHint}
                control={
                  <Segmented
                    value={settings.ringMetric}
                    options={[
                      { value: "session" as const, label: text.metricSession },
                      { value: "week" as const, label: text.metricWeek },
                      { value: "highest" as const, label: text.metricHighest }
                    ]}
                    onChange={(value) => patch({ ringMetric: value })}
                  />
                }
              />
              <div className="preview">
                <Ring
                  size={ORB_DIAMETERS[settings.orbSize]}
                  percent={usage.state === "ok" ? percent : 62}
                  secondaryPercent={usage.state === "ok" ? findWindow(usage, secondaryMetric(settings.ringMetric))?.percent ?? 0 : 28}
                  color={ringColor(usage.state === "ok" ? percent : 62, settings.colorMode, settings.accentColor)}
                  thickness={Math.max(5, ORB_DIAMETERS[settings.orbSize] * 0.11)}
                />
              </div>
            </Section>
          </>
        )}

        {tab === "behavior" && (
          <>
            <Section title={text.floatingOrb}>
              <Row
                label={text.alwaysOnTop}
                hint={text.alwaysOnTopHint}
                control={<Toggle checked={settings.alwaysOnTop} onChange={(value) => patch({ alwaysOnTop: value })} />}
              />
              <Row
                label={text.lockPosition}
                hint={text.lockPositionHint}
                control={<Toggle checked={settings.lockPosition} onChange={(value) => patch({ lockPosition: value })} />}
              />
              <Row
                label={text.resetPosition}
                hint={text.resetPositionHint}
                control={
                  <button type="button" className="button" onClick={() => { void window.circle.resetPosition().then(setSettings); }}>
                    {text.resetPosition}
                  </button>
                }
              />
            </Section>

            <Section title={text.updatesSection}>
              <Row
                label={text.refreshInterval}
                hint={text.refreshIntervalHint}
                control={
                  <Slider
                    value={Math.round(settings.refreshIntervalSeconds / 60)}
                    min={Math.max(1, Math.round(MIN_REFRESH_INTERVAL_SECONDS / 60))}
                    max={60}
                    step={1}
                    onChange={(value) => patch({ refreshIntervalSeconds: value * 60 })}
                    format={(value) => `${value} ${text.minutes}`}
                  />
                }
              />
              <Row
                label={text.notifications}
                hint={text.notificationsHint}
                control={<Toggle checked={settings.notificationsEnabled} onChange={(value) => patch({ notificationsEnabled: value })} />}
              />
              <Row
                label={text.thresholds}
                hint={text.thresholdsHint}
                control={
                  <input
                    className="text-input"
                    type="text"
                    inputMode="numeric"
                    disabled={!settings.notificationsEnabled}
                    value={thresholdDraft ?? settings.notificationThresholds.join(", ")}
                    onChange={(event) => setThresholdDraft(event.target.value)}
                    onBlur={(event) => {
                      patch({ notificationThresholds: parseThresholds(event.target.value) });
                      setThresholdDraft(null);
                    }}
                  />
                }
              />
            </Section>

            <Section title={text.systemSection}>
              <Row
                label={text.launchAtLogin}
                hint={loginItem.available ? text.launchAtLoginHint : text.launchAtLoginUnavailable}
                control={
                  <Toggle
                    checked={loginItem.enabled}
                    disabled={!loginItem.available}
                    onChange={(value) => { void window.circle.setLoginItem(value).then(setLoginItem); }}
                  />
                }
              />
              <Row
                label={text.language}
                hint={text.languageHint}
                control={
                  <Segmented
                    value={settings.language}
                    options={[
                      { value: "en" as Language, label: "English" },
                      { value: "pt-BR" as Language, label: "Português (BR)" }
                    ]}
                    onChange={(value) => patch({ language: value })}
                  />
                }
              />
            </Section>
          </>
        )}

        {tab === "about" && (
          <Section title={text.appName}>
            <p className="body">{text.aboutBody}</p>
            <p className="muted">{text.privacyNote}</p>
            {info && (
              <>
                <Row label={text.version} control={<span className="value">{info.version} · Electron {info.electron}</span>} />
                <Row label={text.platform} control={<span className="value">{info.platform}{info.packaged ? "" : " · dev"}</span>} />
                <Row
                  label={text.dataFolder}
                  control={
                    <button type="button" className="button" onClick={() => { void window.circle.openDataFolder(); }}>
                      {info.dataPath}
                    </button>
                  }
                />
              </>
            )}
            <Row
              label={text.quitCircle}
              hint={text.quitHint}
              control={
                <button type="button" className="button button-danger" onClick={() => { void window.circle.quit(); }}>
                  {text.quit}
                </button>
              }
            />
          </Section>
        )}
      </main>
    </div>
  );
}

/** "75, 90" and "75 90" both work; anything else is ignored. */
export function parseThresholds(value: string): number[] {
  const numbers = value
    .split(/[,;\s]+/)
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 100)
    .map((entry) => Math.round(entry));
  return [...new Set(numbers)].sort((left, right) => left - right).slice(0, 5);
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
