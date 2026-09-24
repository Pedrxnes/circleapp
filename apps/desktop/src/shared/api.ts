import type { AppInfo, HistorySummary, HistoryView, LoginItemStatus, ModelUsageSummary, OrbLayout, Settings, SourceInfo, Usage } from "./types";

export interface CircleState {
  settings: Settings;
  usage: Usage;
  layout: OrbLayout;
}

/** The full surface both renderers see on `window.circle`. */
export interface CircleApi {
  getState(): Promise<CircleState>;
  refresh(): Promise<Usage>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  resetPosition(): Promise<Settings>;
  setInteractive(interactive: boolean): Promise<void>;
  beginDrag(): Promise<void>;
  endDrag(): Promise<void>;
  openSettings(): Promise<void>;
  getSources(): Promise<SourceInfo>;
  getHistory(view?: HistoryView, offset?: number): Promise<HistorySummary>;
  getModelUsage(): Promise<ModelUsageSummary>;
  getLoginItem(): Promise<LoginItemStatus>;
  setLoginItem(enabled: boolean): Promise<LoginItemStatus>;
  getAppInfo(): Promise<AppInfo>;
  openDataFolder(): Promise<string>;
  quit(): Promise<void>;
  onUsage(callback: (usage: Usage) => void): void;
  onSettings(callback: (settings: Settings) => void): void;
  onLayout(callback: (layout: OrbLayout) => void): void;
}
