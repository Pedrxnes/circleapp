import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { PRESENCE_CACHE_TTL_MS, clampPercent } from "../shared/types";
import type { MetricKey, SourceChoice, SourceInfo, Usage, UsageWindow, WslPresence } from "../shared/types";
import { circlePaths, WSL_CREDENTIALS_PATH, wslProjectRoots, type CirclePaths } from "./paths";
import { makeWslShell, type WslShell } from "./wsl";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const OAUTH_BETA = "oauth-2025-04-20";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "Circle/0.1";

export interface ClaudeCredentials {
  accessToken: string;
  expiresAt: number | null;
}

/** Windows keys mirror the API's snake_case window names. */
const WINDOW_KEYS: { key: MetricKey; field: string }[] = [
  { key: "session", field: "five_hour" },
  { key: "week", field: "seven_day" },
  { key: "weekOpus", field: "seven_day_opus" }
];

interface UsageResponse {
  [field: string]: { utilization?: number; resets_at?: string } | undefined;
}

export class ClaudeService {
  private readonly paths: CirclePaths;
  private presenceCache: { at: number; entries: WslPresence[] } | null = null;
  private accountEmail: string | null = null;
  private readonly wslHomes = new Map<string, string | null>();

  constructor(
    private readonly loadSource: () => SourceChoice | null,
    private readonly wsl: WslShell = makeWslShell(),
    paths: CirclePaths = circlePaths({ platform: process.platform, home: homedir(), env: process.env })
  ) {
    this.paths = paths;
  }

  hasHostCredentials(): boolean {
    return existsSync(this.paths.claudeCredentials);
  }

  /** Where credentials were found and which of them Circle will read. */
  async sources(): Promise<SourceInfo> {
    const host = this.hasHostCredentials();
    const wsl = await this.wslPresence();
    const saved = this.loadSource();
    return { host, wsl, saved, active: chooseSource({ host, wsl }, saved) };
  }

  async fetch(): Promise<Usage> {
    const info = await this.sources();
    if (!info.active) return noCredentials();
    try {
      const credentials = info.active.location === "wsl"
        ? parseCredentials(await this.wsl.readFile(info.active.distro ?? "", WSL_CREDENTIALS_PATH))
        : parseCredentials(readFileSync(this.paths.claudeCredentials, "utf8"));
      if (!credentials) return noCredentials();
      if (isExpired(credentials)) throw new Error("Claude Code's saved login has expired. Run `claude` and sign in again.");
      const windows = parseUsage(await requestWithRetry(USAGE_URL, authHeaders(credentials.accessToken)));
      if (this.accountEmail === null) {
        this.accountEmail = await requestAccountEmail(credentials.accessToken);
      }
      return {
        state: "ok",
        windows,
        accountEmail: this.accountEmail,
        updatedAt: new Date().toISOString(),
        error: null,
        sourceLabel: sourceLabel(info.active)
      };
    } catch (error) {
      return {
        state: "error",
        windows: [],
        accountEmail: this.accountEmail,
        updatedAt: null,
        error: error instanceof Error ? error.message : "Could not load usage.",
        sourceLabel: sourceLabel(info.active)
      };
    }
  }

  /** Where the active source's Claude Code writes its session transcripts. */
  async transcriptRoots(): Promise<string[]> {
    const { active } = await this.sources();
    if (!active) return [];
    if (active.location === "host") return this.paths.claudeProjects;
    const distro = active.distro ?? "";
    if (!this.wslHomes.has(distro)) this.wslHomes.set(distro, await this.wsl.home(distro));
    const home = this.wslHomes.get(distro);
    return home ? wslProjectRoots(distro, home) : [];
  }

  private async wslPresence(): Promise<WslPresence[]> {
    if (this.presenceCache && Date.now() - this.presenceCache.at < PRESENCE_CACHE_TTL_MS) return this.presenceCache.entries;
    const distros = await this.wsl.distros();
    const entries: WslPresence[] = [];
    for (const distro of distros) entries.push({ distro, present: await this.wsl.hasClaude(distro) });
    this.presenceCache = { at: Date.now(), entries };
    return entries;
  }

  /** Drop the cached profile lookup so a re-login is picked up. */
  forgetAccount(): void {
    this.accountEmail = null;
    this.presenceCache = null;
    this.wslHomes.clear();
  }
}

/** Prefer the saved choice when its credentials still exist, otherwise fall back. */
export function chooseSource(info: { host: boolean; wsl: WslPresence[] }, saved: SourceChoice | null): SourceChoice | null {
  const firstWsl = (): SourceChoice | null => {
    const present = info.wsl.find((entry) => entry.present);
    return present ? { location: "wsl", distro: present.distro } : null;
  };
  if (saved?.location === "host") return info.host ? saved : firstWsl();
  if (saved?.location === "wsl") {
    if (info.wsl.some((entry) => entry.distro === saved.distro && entry.present)) return saved;
    return info.host ? { location: "host" } : firstWsl();
  }
  return info.host ? { location: "host" } : firstWsl();
}

export function sourceLabel(source: SourceChoice | null): string | null {
  if (!source) return null;
  return source.location === "wsl" ? `WSL · ${source.distro}` : "Windows";
}

export function parseCredentials(raw: string): ClaudeCredentials | null {
  try {
    const oauth = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } }).claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return { accessToken: oauth.accessToken, expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null };
  } catch {
    return null;
  }
}

export function parseUsage(body: string): UsageWindow[] {
  const parsed = JSON.parse(body) as UsageResponse;
  return WINDOW_KEYS.flatMap(({ key, field }) => {
    const limit = parsed[field];
    if (!limit || limit.utilization === undefined) return [];
    return [{ key, percent: clampPercent(Number(limit.utilization)), resetsAt: limit.resets_at ?? null }];
  });
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "anthropic-beta": OAUTH_BETA, "User-Agent": USER_AGENT };
}

/** Claude Code refreshes this file itself, so an elapsed expiry means the
 * stored token really is dead. A minute of grace absorbs clock skew. */
export function isExpired(credentials: ClaudeCredentials, now = Date.now()): boolean {
  return credentials.expiresAt !== null && credentials.expiresAt + 60_000 < now;
}

function noCredentials(): Usage {
  return { state: "no-credentials", windows: [], accountEmail: null, updatedAt: null, error: null, sourceLabel: null };
}

async function requestAccountEmail(token: string): Promise<string | null> {
  try {
    const body = await fetchWithTimeout(PROFILE_URL, authHeaders(token));
    if (!body.ok) return null;
    const parsed = JSON.parse(await body.text()) as { account?: { email?: string } };
    return parsed.account?.email ?? null;
  } catch {
    return null;
  }
}

function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A response Circle should surface as-is instead of retrying. */
class FatalRequestError extends Error {}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "Claude Code's saved login is no longer valid. Run `claude` and sign in again.";
  if (status === 429) return "Anthropic rate limited Circle. Try again shortly.";
  return `Anthropic returned ${status}.`;
}

/** Three attempts, honouring Retry-After so a rate limit does not become an error. */
export async function requestWithRetry(url: string, headers: Record<string, string>): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchWithTimeout(url, headers);
      if (response.ok) return await response.text();
      if (response.status === 429 && attempt < 2) {
        const header = Number(response.headers.get("Retry-After"));
        const delay = Math.min((Number.isFinite(header) && header > 0 ? header : 2 ** (attempt + 1)) * 1000, 30_000);
        await sleep(delay);
        continue;
      }
      throw new FatalRequestError(messageForStatus(response.status));
    } catch (error) {
      if (error instanceof FatalRequestError) throw new Error(error.message);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === "AbortError") lastError = new Error("The request to Anthropic timed out.");
      if (attempt === 2) throw lastError;
    }
  }
  throw lastError ?? new Error("Could not load usage.");
}
