import { join } from "node:path";

export interface PathEnvironment {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

export interface CirclePaths {
  /** Claude Code's OAuth credential file on the host filesystem. */
  claudeCredentials: string;
}

/**
 * Claude Code keeps its OAuth credentials in `~/.claude/.credentials.json` on
 * every platform it supports, including Windows, where `homedir()` resolves to
 * the user profile. `CLAUDE_CONFIG_DIR` overrides the directory when set, so
 * portable installs keep working.
 */
export function circlePaths(context: PathEnvironment): CirclePaths {
  const configDir = context.env.CLAUDE_CONFIG_DIR || join(context.home, ".claude");
  return { claudeCredentials: join(configDir, ".credentials.json") };
}

/** Path used inside a WSL distro, relative to that distro's home directory. */
export const WSL_CREDENTIALS_PATH = ".claude/.credentials.json";
