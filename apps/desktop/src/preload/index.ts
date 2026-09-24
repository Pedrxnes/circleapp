import { contextBridge, ipcRenderer } from "electron";
import type { CircleApi } from "../shared/api";
import type { OrbLayout, Settings, Usage } from "../shared/types";

const api: CircleApi = {
  getState: () => ipcRenderer.invoke("circle:get-state"),
  refresh: () => ipcRenderer.invoke("circle:refresh"),
  updateSettings: (patch) => ipcRenderer.invoke("circle:update-settings", patch),
  resetPosition: () => ipcRenderer.invoke("circle:reset-position"),
  setInteractive: (interactive) => ipcRenderer.invoke("circle:set-interactive", interactive),
  beginDrag: () => ipcRenderer.invoke("circle:begin-drag"),
  endDrag: () => ipcRenderer.invoke("circle:end-drag"),
  openSettings: () => ipcRenderer.invoke("circle:open-settings"),
  getSources: () => ipcRenderer.invoke("circle:get-sources"),
  getHistory: (view, offset) => ipcRenderer.invoke("circle:get-history", view, offset),
  getLoginItem: () => ipcRenderer.invoke("circle:get-login-item"),
  setLoginItem: (enabled) => ipcRenderer.invoke("circle:set-login-item", enabled),
  getAppInfo: () => ipcRenderer.invoke("circle:get-app-info"),
  openDataFolder: () => ipcRenderer.invoke("circle:open-data-folder"),
  quit: () => ipcRenderer.invoke("circle:quit"),
  onUsage: (callback) => { ipcRenderer.on("circle:usage", (_event, value: Usage) => callback(value)); },
  onSettings: (callback) => { ipcRenderer.on("circle:settings", (_event, value: Settings) => callback(value)); },
  onLayout: (callback) => { ipcRenderer.on("circle:layout", (_event, value: OrbLayout) => callback(value)); }
};

contextBridge.exposeInMainWorld("circle", Object.freeze(api));
