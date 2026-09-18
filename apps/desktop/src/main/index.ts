import { app, BrowserWindow, Menu, Notification, nativeImage, powerMonitor, screen, shell, Tray, ipcMain } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderOrbIcon } from "../shared/orb-icon";
import { strings } from "../shared/i18n";
import {
  ORB_DIAMETERS,
  findWindow,
  isHistoryView,
  ringColor,
  ringPercent,
  secondaryMetric
} from "../shared/types";
import type { AppInfo, LoginItemStatus, MetricKey, OrbLayout, Settings, Usage } from "../shared/types";
import { ClaudeService } from "./claude";
import { computeLayout } from "./layout";
import { HistoryStore } from "./history";
import { SettingsStore } from "./settings";
import { ThresholdAlerts } from "./alerts";

const APP_ID = "com.circle.desktop";

let orbWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let dragTimer: NodeJS.Timeout | undefined;
let dragOffset: { x: number; y: number } | undefined;
/** Where the drag has moved the orb to, so the release persists the real point. */
let dragCenter: { x: number; y: number } | undefined;
let isQuitting = false;
let usage: Usage = { state: "no-credentials", windows: [], accountEmail: null, updatedAt: null, error: null, sourceLabel: null };

let settingsStore: SettingsStore;
let historyStore: HistoryStore;
let claude: ClaudeService;
const alerts = new ThresholdAlerts();

function settings(): Settings {
  return settingsStore.load();
}

// ---------------------------------------------------------------- orb geometry

/** Screen point the orb defaults to: the bottom-right corner of the work area. */
function defaultOrbCenter(diameter: number): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea;
  const margin = diameter / 2 + 28;
  return { x: area.x + area.width - margin, y: area.y + area.height - margin };
}

function currentLayout(): ReturnType<typeof computeLayout> {
  const current = settings();
  const diameter = ORB_DIAMETERS[current.orbSize];
  const stored = current.orbCenterX !== null && current.orbCenterY !== null
    ? { x: current.orbCenterX, y: current.orbCenterY }
    : defaultOrbCenter(diameter);
  const area = screen.getDisplayNearestPoint(stored).workArea;
  return computeLayout(stored, area, diameter);
}

function applyOrbBounds(): void {
  if (!orbWindow || orbWindow.isDestroyed()) return;
  const { bounds, layout } = currentLayout();
  orbWindow.setBounds(bounds);
  orbWindow.webContents.send("circle:layout", layout);
}

// ---------------------------------------------------------------- orb window

function createOrbWindow(): BrowserWindow {
  const { bounds } = currentLayout();
  const window = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: "Circle",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  window.setAlwaysOnTop(settings().alwaysOnTop, "floating");
  // The orb is a small mark inside a mostly transparent box: everything but the
  // orb (and the open panel) must let clicks through to the desktop behind it.
  window.setIgnoreMouseEvents(true, { forward: true });
  void window.loadFile(join(__dirname, "../renderer/orb.html"));
  window.webContents.on("did-finish-load", () => {
    window.webContents.send("circle:layout", currentLayout().layout);
    window.webContents.send("circle:settings", settings());
    window.webContents.send("circle:usage", usage);
  });
  window.on("closed", () => { orbWindow = undefined; });
  return window;
}

function orbShouldShow(): boolean {
  const current = settings();
  return current.orbEnabled && !current.orbHidden;
}

function syncOrbWindow(): void {
  if (!orbShouldShow()) {
    orbWindow?.destroy();
    orbWindow = undefined;
    return;
  }
  if (!orbWindow || orbWindow.isDestroyed()) orbWindow = createOrbWindow();
  applyOrbBounds();
  orbWindow.setAlwaysOnTop(settings().alwaysOnTop, "floating");
  if (!orbWindow.isVisible()) orbWindow.showInactive();
}

// ------------------------------------------------------------ settings window

function createSettingsWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 880,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: strings(settings().language).settingsTitle,
    backgroundColor: "#0f1115",
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  window.removeMenu();
  setTaskbarDetails(window);
  void window.loadFile(join(__dirname, "../renderer/settings.html"));
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    settingsWindow = undefined;
    // Closing a framed window over the transparent, layered orb window can
    // leave a stale composited region on Windows until something forces a
    // repaint, so nudge the orb's bounds to make DWM redraw it.
    if (orbWindow && !orbWindow.isDestroyed()) {
      const bounds = orbWindow.getBounds();
      orbWindow.setBounds(bounds);
    }
  });
  return window;
}

function showSettings(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) settingsWindow = createSettingsWindow();
  if (settingsWindow.isMinimized()) settingsWindow.restore();
  settingsWindow.show();
  settingsWindow.focus();
}

function appIconPath(): string {
  // electron-builder packs resources/icon.png into app.asar, which getAppPath() points at.
  return join(app.getAppPath(), "resources", "icon.png");
}

/**
 * Windows draws the taskbar button from whatever the AppUserModelID resolves to, not from the
 * window icon. With no installed Start Menu shortcut (`npm run dev`) that is electron.exe, so
 * give the window its own relaunch icon. The shell needs a real .ico file, not a path in asar.
 */
function setTaskbarDetails(window: BrowserWindow): void {
  if (process.platform !== "win32") return;
  window.setAppDetails({
    appId: APP_ID,
    appIconPath: app.isPackaged ? process.execPath : join(app.getAppPath(), "resources", "icon.ico"),
    relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`,
    relaunchDisplayName: "Circle"
  });
}

// ------------------------------------------------------------------- tray

function trayIcon(): Electron.NativeImage {
  const current = settings();
  const percent = ringPercent(usage, current.ringMetric);
  const secondary = findWindow(usage, secondaryMetric(current.ringMetric))?.percent ?? 0;
  const colour = usage.state === "ok" ? ringColor(percent, current.colorMode, current.accentColor) : "#8a8f98";
  const png = renderOrbIcon({
    size: 32,
    percent: usage.state === "ok" ? percent : 0,
    secondaryPercent: usage.state === "ok" ? secondary : 0,
    color: colour,
    thickness: 0.34,
    inset: 0.08
  });
  return nativeImage.createFromBuffer(png);
}

function formatReset(resetsAt: string | null, language: Settings["language"]): string {
  if (!resetsAt) return "";
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return "";
  const seconds = (target - Date.now()) / 1000;
  const text = strings(language);
  if (seconds > 0 && seconds < 86_400) {
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const span = hours > 0 ? (minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
    return `${text.resetsIn} ${span}`;
  }
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";
  return `${text.resetsOn} ${new Date(target).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}`;
}

function metricLabel(key: MetricKey, language: Settings["language"]): string {
  const text = strings(language);
  return key === "session" ? text.session : key === "week" ? text.week : text.weekOpus;
}

function updateTray(): void {
  if (!tray) return;
  const current = settings();
  const text = strings(current.language);
  tray.setImage(trayIcon());

  const summary = usage.state === "ok" && usage.windows.length
    ? usage.windows.map((window) => `${metricLabel(window.key, current.language)} ${Math.round(window.percent)}%`).join(" · ")
    : usage.state === "no-credentials" ? text.noCredentials : usage.error ?? text.noUsageYet;
  tray.setToolTip(`${text.appName} — ${summary}`);

  const usageItems: Electron.MenuItemConstructorOptions[] = usage.state === "ok" && usage.windows.length
    ? usage.windows.map((window) => ({
      label: `${metricLabel(window.key, current.language)} — ${Math.round(window.percent)}% ${text.used}${formatReset(window.resetsAt, current.language) ? ` · ${formatReset(window.resetsAt, current.language)}` : ""}`,
      enabled: false
    }))
    : [{ label: summary, enabled: false }];

  tray.setContextMenu(Menu.buildFromTemplate([
    ...usageItems,
    { type: "separator" },
    orbShouldShow()
      ? { label: text.hideOrb, click: () => { settingsStore.update({ orbHidden: true }); onSettingsChanged(); } }
      : { label: text.showOrb, click: () => { settingsStore.update({ orbEnabled: true, orbHidden: false }); onSettingsChanged(); } },
    { label: text.openSettings, click: showSettings },
    { label: text.refresh, click: () => { void refresh(); } },
    { type: "separator" },
    { label: text.quit, click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function createTray(): void {
  tray = new Tray(trayIcon());
  // Left click restores a hidden orb, which is how the taskbar's hidden-icons
  // area doubles as Circle's "unhide" control; otherwise it opens Settings.
  tray.on("click", () => {
    if (!orbShouldShow()) {
      settingsStore.update({ orbEnabled: true, orbHidden: false });
      onSettingsChanged();
      return;
    }
    showSettings();
  });
  updateTray();
}

// ----------------------------------------------------------------- refreshing

function notify(): void {
  const current = settings();
  if (!current.notificationsEnabled || !Notification.isSupported()) return;
  const text = strings(current.language);
  for (const alert of alerts.evaluate(usage, current.notificationThresholds)) {
    new Notification({
      title: `${text.appName} — ${metricLabel(alert.key, current.language)}`,
      body: `${Math.round(alert.percent)}% ${text.used}`,
      icon: appIconPath()
    }).show();
  }
}

function broadcast(): void {
  orbWindow?.webContents.send("circle:usage", usage);
  settingsWindow?.webContents.send("circle:usage", usage);
}

async function refresh(): Promise<Usage> {
  usage = await claude.fetch();
  historyStore.record(usage);
  notify();
  updateTray();
  broadcast();
  return usage;
}

let refreshIntervalSeconds = 0;

/** Only re-arm when the interval really changed, so unrelated settings edits
 * do not keep pushing the next refresh further away. */
function restartRefreshTimer(): void {
  const seconds = settings().refreshIntervalSeconds;
  if (refreshTimer && seconds === refreshIntervalSeconds) return;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshIntervalSeconds = seconds;
  refreshTimer = setInterval(() => { void refresh(); }, seconds * 1000);
}

/** Re-apply everything a settings change can affect, then tell both windows. */
function onSettingsChanged(): void {
  const current = settings();
  syncOrbWindow();
  updateTray();
  restartRefreshTimer();
  orbWindow?.webContents.send("circle:settings", current);
  settingsWindow?.webContents.send("circle:settings", current);
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.setTitle(strings(current.language).settingsTitle);
}

// --------------------------------------------------------------- orb dragging

/**
 * Frameless drags are driven from the main process: polling the OS cursor keeps
 * the orb glued to the pointer even when it leaves the window's own bounds.
 */
function beginDrag(): void {
  if (settings().lockPosition || !orbWindow) return;
  endDrag(false);
  const cursor = screen.getCursorScreenPoint();
  const { center } = currentLayout();
  dragOffset = { x: center.x - cursor.x, y: center.y - cursor.y };
  dragCenter = center;
  dragTimer = setInterval(() => {
    if (!orbWindow || orbWindow.isDestroyed() || !dragOffset) { endDrag(false); return; }
    const point = screen.getCursorScreenPoint();
    const target = { x: point.x + dragOffset.x, y: point.y + dragOffset.y };
    const area = screen.getDisplayNearestPoint(target).workArea;
    const placement = computeLayout(target, area, ORB_DIAMETERS[settings().orbSize]);
    // Track the clamped centre: crossing the middle of the screen flips the
    // anchor, so the window bounds alone no longer locate the orb.
    dragCenter = placement.center;
    orbWindow.setBounds(placement.bounds);
    orbWindow.webContents.send("circle:layout", placement.layout);
  }, 16);
}

function endDrag(persist = true): void {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = undefined;
  const center = dragCenter;
  dragCenter = undefined;
  if (!dragOffset) return;
  dragOffset = undefined;
  if (persist && center) {
    settingsStore.update({ orbCenterX: center.x, orbCenterY: center.y });
    applyOrbBounds();
  }
}

// ------------------------------------------------------------------ login item

function loginItemStatus(): LoginItemStatus {
  if (process.platform === "linux") return { available: false, enabled: false };
  return { available: true, enabled: app.getLoginItemSettings().openAtLogin };
}

function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    dataPath: app.getPath("userData"),
    electron: process.versions.electron ?? ""
  };
}

// ------------------------------------------------------------------------ IPC

function isTrusted(event: Electron.IpcMainInvokeEvent): boolean {
  const owners = [orbWindow?.webContents, settingsWindow?.webContents];
  return owners.some((owner) => !!owner && event.sender === owner && event.senderFrame?.url === owner.mainFrame.url);
}

function requireTrusted(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrusted(event)) throw new Error("Untrusted IPC sender.");
}

function registerIpc(): void {
  ipcMain.handle("circle:get-state", (event) => {
    requireTrusted(event);
    return { settings: settings(), usage, layout: currentLayout().layout };
  });
  ipcMain.handle("circle:refresh", (event) => { requireTrusted(event); return refresh(); });
  ipcMain.handle("circle:update-settings", (event, patch: unknown) => {
    requireTrusted(event);
    if (typeof patch !== "object" || patch === null) throw new Error("Invalid settings patch.");
    // `update` re-validates every field, so unknown or malformed keys are dropped.
    const next = settingsStore.update(patch as Partial<Settings>);
    onSettingsChanged();
    return next;
  });
  ipcMain.handle("circle:reset-position", (event) => {
    requireTrusted(event);
    const next = settingsStore.update({ orbCenterX: null, orbCenterY: null });
    applyOrbBounds();
    return next;
  });
  ipcMain.handle("circle:set-interactive", (event, interactive: unknown) => {
    requireTrusted(event);
    if (typeof interactive !== "boolean") throw new Error("Invalid interactivity flag.");
    if (!orbWindow || orbWindow.isDestroyed()) return;
    orbWindow.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.handle("circle:begin-drag", (event) => { requireTrusted(event); beginDrag(); });
  ipcMain.handle("circle:end-drag", (event) => { requireTrusted(event); endDrag(); });
  ipcMain.handle("circle:open-settings", (event) => { requireTrusted(event); showSettings(); });
  ipcMain.handle("circle:get-sources", (event) => { requireTrusted(event); return claude.sources(); });
  ipcMain.handle("circle:get-history", (event, view: unknown, offset: unknown) => {
    requireTrusted(event);
    const safeView = isHistoryView(view) ? view : "week";
    const safeOffset = typeof offset === "number" && Number.isInteger(offset) && offset >= 0 ? offset : 0;
    return historyStore.summary(safeView, safeOffset);
  });
  ipcMain.handle("circle:get-login-item", (event) => { requireTrusted(event); return loginItemStatus(); });
  ipcMain.handle("circle:set-login-item", (event, enabled: unknown) => {
    requireTrusted(event);
    if (typeof enabled !== "boolean") throw new Error("Invalid launch-at-login flag.");
    if (process.platform !== "linux") app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
    return loginItemStatus();
  });
  ipcMain.handle("circle:get-app-info", (event) => { requireTrusted(event); return appInfo(); });
  ipcMain.handle("circle:open-data-folder", (event) => {
    requireTrusted(event);
    return shell.openPath(app.getPath("userData"));
  });
  ipcMain.handle("circle:quit", (event) => { requireTrusted(event); isQuitting = true; app.quit(); });
}


// ------------------------------------------------------------------- smoke

/**
 * `CIRCLE_SMOKE=1` seeds a demo reading, opens both windows, writes a
 * screenshot of each to `CIRCLE_SMOKE_DIR` and quits. It proves the renderers
 * mount and lets anyone eyeball the orb without a Claude Code login.
 */
function smokeUsage(): Usage {
  const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const inFourDays = new Date(Date.now() + 4 * 86_400_000).toISOString();
  return {
    state: "ok",
    windows: [
      { key: "session", percent: 68, resetsAt: inTwoHours },
      { key: "week", percent: 34, resetsAt: inFourDays }
    ],
    accountEmail: "demo@example.com",
    updatedAt: new Date().toISOString(),
    error: null,
    sourceLabel: "Windows"
  };
}

async function runSmoke(): Promise<void> {
  const directory = process.env.CIRCLE_SMOKE_DIR ?? app.getPath("temp");
  usage = smokeUsage();
  updateTray();
  broadcast();
  showSettings();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (orbWindow && !orbWindow.isDestroyed()) {
    // Drive the hover so the capture includes the open panel.
    const { layout } = currentLayout();
    orbWindow.webContents.sendInputEvent({ type: "mouseMove", x: layout.centerX, y: layout.centerY });
    await new Promise((resolve) => setTimeout(resolve, 800));
    writeFileSync(join(directory, "orb.png"), (await orbWindow.webContents.capturePage()).toPNG());
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // Capture every tab, so a visual regression anywhere in Settings shows up.
    for (const [index, name] of ["usage", "appearance", "behavior", "about"].entries()) {
      await settingsWindow.webContents.executeJavaScript(
        `document.querySelectorAll(".tab")[${index}]?.click();`
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      writeFileSync(join(directory, `settings-${name}.png`), (await settingsWindow.webContents.capturePage()).toPNG());
    }
  }
  console.log(`CIRCLE_SMOKE_OK orb=${!!orbWindow} settings=${!!settingsWindow}`);
  isQuitting = true;
  app.quit();
}

// ------------------------------------------------------------------ lifecycle

app.setName("Circle");
app.setAppUserModelId(APP_ID);

if (process.platform === "linux") {
  // Reduced-compositing environments crash the GPU process for transparent
  // windows; software compositing keeps the orb drawable there.
  app.disableHardwareAcceleration();
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => { showSettings(); });
  void app.whenReady().then(() => {
    settingsStore = new SettingsStore(app.getPath("userData"));
    historyStore = new HistoryStore(app.getPath("userData"));
    claude = new ClaudeService(() => settings().source);

    registerIpc();
    createTray();
    syncOrbWindow();

    if (process.env.CIRCLE_SMOKE === "1") { void runSmoke(); return; }

    void refresh();
    restartRefreshTimer();

    // Usage keeps accruing while the machine sleeps, so read it again on wake.
    powerMonitor.on("resume", () => { void refresh(); });
    screen.on("display-metrics-changed", () => applyOrbBounds());
    screen.on("display-removed", () => applyOrbBounds());
  });
}

app.on("window-all-closed", () => { /* Circle stays alive in the tray. */ });
app.on("before-quit", () => {
  isQuitting = true;
  if (refreshTimer) clearInterval(refreshTimer);
  if (dragTimer) clearInterval(dragTimer);
});
