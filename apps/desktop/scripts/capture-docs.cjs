/**
 * Regenerates the screenshots in `docs/` from the real renderers, using a
 * seeded reading so the images are deterministic and need no Claude Code login.
 *
 *   npm run build && npm run capture:docs
 *
 * On a headless machine, wrap it: `xvfb-run -a npm run capture:docs`.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const OUT = join(__dirname, "..", "..", "..", "docs");
const PRELOAD = join(__dirname, "..", "dist", "preload", "index.js");
const RENDERER = join(__dirname, "..", "dist", "renderer");

const settings = {
  orbEnabled: true, orbHidden: false, orbSize: "medium", orbOpacity: 1,
  orbCenterX: null, orbCenterY: null, lockPosition: false, alwaysOnTop: true,
  showPercentLabel: true, ringMetric: "session", colorMode: "dynamic",
  accentColor: "#d97757", refreshIntervalSeconds: 300, notificationsEnabled: true,
  notificationThresholds: [75, 90], language: "en", source: null
};

const hours = (count) => new Date(Date.now() + count * 3_600_000).toISOString();

const usage = {
  state: "ok",
  windows: [
    { key: "session", percent: 68, resetsAt: hours(2) },
    { key: "week", percent: 34, resetsAt: hours(96) }
  ],
  accountEmail: "you@example.com",
  updatedAt: new Date().toISOString(),
  error: null,
  sourceLabel: "Windows"
};

// A week of readings so the trend chart has something to draw.
const samples = Array.from({ length: 96 }, (_unused, index) => {
  const at = new Date(Date.now() - (95 - index) * 105 * 60_000);
  const wave = Math.sin(index / 7) * 26 + 44;
  return { at: at.toISOString(), session: Math.max(2, wave + (index % 5) * 3), week: Math.min(80, 6 + index * 0.32) };
});

const SETTINGS_WIDTH = 880;
const SETTINGS_HEIGHT = 700;
const ORB_DIAMETER = 72;
const layout = { boxWidth: 400, boxHeight: 300, orbDiameter: ORB_DIAMETER, centerX: 350, centerY: 168, anchor: "right" };

ipcMain.handle("circle:get-state", () => ({ settings, usage, layout }));
ipcMain.handle("circle:get-app-info", () => ({
  version: require("../package.json").version, platform: "win32", packaged: true,
  dataPath: "C:\\Users\\you\\AppData\\Roaming\\Circle", electron: process.versions.electron
}));
ipcMain.handle("circle:get-login-item", () => ({ available: true, enabled: true }));
ipcMain.handle("circle:get-history", () => {
  // The derived numbers come from the real history module so the Weekly pace section matches the app.
  const { burnRatePerHour, projectExhaustion, weeklyActivity } = require("../dist/main/history.js");
  const now = new Date();
  const latest = samples[samples.length - 1];
  const sessionRate = burnRatePerHour(samples, "session");
  const weekRate = burnRatePerHour(samples, "week");
  return {
    samples,
    peakSession: Math.max(...samples.map((sample) => sample.session)),
    peakWeek: Math.max(...samples.map((sample) => sample.week)),
    sessionRatePerHour: sessionRate,
    weekRatePerHour: weekRate,
    projectedSessionExhaustion: projectExhaustion(sessionRate, latest.session, now),
    projectedWeekExhaustion: projectExhaustion(weekRate, latest.week, now),
    rangeFrom: samples[0].at,
    rangeTo: now.toISOString(),
    hasOlder: false,
    hasNewer: false,
    weekly: weeklyActivity(samples, now)
  };
});
ipcMain.handle("circle:get-model-usage", () => {
  // Seeded replies run through the real transcript module, so the split matches what the app computes.
  const { summarizeModels } = require("../dist/main/transcripts.js");
  const { apiCost } = require("../dist/shared/models.js");
  const plan = [
    // [hours ago, model, replies, output tokens each]
    [1.2, "claude-opus-4-8", 34, 1400], [0.6, "claude-sonnet-5", 40, 900],
    [9, "claude-opus-4-8", 55, 1500], [8.5, "claude-haiku-4-5", 30, 600],
    [30, "claude-sonnet-5", 70, 1100], [52, "claude-opus-4-8", 60, 1600], [51, "claude-sonnet-5", 20, 800],
    [75, "claude-sonnet-5", 45, 1000], [98, "claude-opus-4-8", 40, 1500]
  ];
  const entries = plan.flatMap(([ago, model, replies, output]) => Array.from({ length: replies }, (_unused, index) => {
    const tokens = { input: 40, output, cacheWrite5m: 2500, cacheWrite1h: 0, cacheRead: 60000 };
    return { at: Date.now() - ago * 3_600_000 + index * 60_000, model, key: null, ...tokens, cost: apiCost(model, tokens) };
  })).sort((left, right) => left.at - right.at);
  return summarizeModels(true, entries, usage, samples);
});
ipcMain.handle("circle:get-sources", () => ({
  host: true, wsl: [{ distro: "Ubuntu", present: true }], saved: null, active: { location: "host" }
}));
ipcMain.handle("circle:set-interactive", () => undefined);
ipcMain.handle("circle:update-settings", () => settings);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const web = { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false };

async function captureOrb(window) {
  await window.loadFile(join(RENDERER, "orb.html"));
  window.showInactive();
  await wait(1200);
  window.webContents.sendInputEvent({ type: "mouseMove", x: layout.centerX, y: layout.centerY });
  await wait(700);
  writeFileSync(join(OUT, "orb.png"), (await window.webContents.capturePage()).toPNG());
}

async function hoverChart(window) {
  const box = await window.webContents.executeJavaScript(
    `(() => { const p = document.querySelector(".chart-plot"); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`
  );
  if (!box) return;
  window.webContents.sendInputEvent({
    type: "mouseMove",
    x: Math.round(box.x + box.width * 0.62),
    y: Math.round(box.y + box.height * 0.5)
  });
  await wait(400);
}

async function captureSettings(window) {
  await window.loadFile(join(RENDERER, "settings.html"));
  window.showInactive();
  // Usage, history and app info all arrive over IPC and each one reflows the
  // page; capture only once the layout has settled.
  await wait(2000);
  for (const [index, name] of ["usage", "appearance", "behaviour", "about"].entries()) {
    await window.webContents.executeJavaScript(`document.querySelectorAll(".tab")[${index}].click()`);
    await wait(500);
    // Grow the window to the tab's full content so the screenshot shows every
    // control instead of the first screenful.
    const overflow = await window.webContents.executeJavaScript(
      `(() => { const c = document.querySelector(".content"); return c.scrollHeight - c.clientHeight; })()`
    );
    window.setContentSize(SETTINGS_WIDTH, SETTINGS_HEIGHT + Math.max(0, overflow));
    await wait(600);
    // The trend chart only shows its readout while hovered, so park the pointer
    // over a peak before the Usage tab is captured.
    if (name === "usage") await hoverChart(window);
    writeFileSync(join(OUT, `settings-${name}.png`), (await window.webContents.capturePage()).toPNG());
    window.setContentSize(SETTINGS_WIDTH, SETTINGS_HEIGHT);
    await wait(200);
  }
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  // Both windows are created up front and destroyed only at the end: tearing
  // one down mid-run aborts the next window's load with ERR_FAILED.
  const orb = new BrowserWindow({
    width: layout.boxWidth, height: layout.boxHeight, show: false, frame: false,
    // The real orb window is transparent; an opaque backdrop keeps the
    // screenshot readable on a light documentation page.
    backgroundColor: "#1c2029", webPreferences: web
  });
  const settingsWindow = new BrowserWindow({ width: SETTINGS_WIDTH, height: SETTINGS_HEIGHT, show: false, webPreferences: web });
  // Both windows must be mapped before capturing: a hidden window produces no
  // new compositor frames, so capturePage returns a stale image and
  // sendInputEvent never reaches the renderer.
  await captureOrb(orb);
  await captureSettings(settingsWindow);
  orb.destroy();
  settingsWindow.destroy();
  console.log(`Wrote screenshots to ${OUT}`);
  app.quit();
});
