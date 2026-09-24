import { join, win32 } from "node:path";

export interface PathEnvironment {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

export interface CirclePaths {
  /** Claude Code's OAuth credential file on the host filesystem. */
  claudeCredentials: string;
  /** Where Claude Code keeps one JSONL transcript per conversation, grouped by project. */
  claudeProjects: string;
}

/**
 * Claude Code keeps its OAuth credentials in `~/.claude/.credentials.json` on
 * every platform it supports, including Windows, where `homedir()` resolves to
 * the user profile. `CLAUDE_CONFIG_DIR` overrides the directory when set, so
 * portable installs keep working.
 */
export function circlePaths(context: PathEnvironment): CirclePaths {
  const configDir = context.env.CLAUDE_CONFIG_DIR || join(context.home, ".claude");
  return { claudeCredentials: join(configDir, ".credentials.json"), claudeProjects: join(configDir, "projects") };
}

/** Path used inside a WSL distro, relative to that distro's home directory. */
export const WSL_CREDENTIALS_PATH = ".claude/.credentials.json";

/** Transcript folder inside a WSL distro, relative to that distro's home directory. */
export const WSL_PROJECTS_PATH = ".claude/projects";

/**
 * Windows path to a file inside a WSL distro, through the `\\wsl$` share, so
 * transcripts can be read with plain `fs` instead of one `wsl.exe` call each.
 */
export function wslSharePath(distro: string, absolutePosixPath: string): string {
  return win32.join(`\\\\wsl$\\${distro}`, ...absolutePosixPath.split("/").filter(Boolean));
}
