import { join, win32 } from "node:path";

export interface PathEnvironment {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

export interface CirclePaths {
  /** Claude Code's OAuth credential file on the host filesystem. */
  claudeCredentials: string;
  /** Directories Claude Code writes its session transcripts under, most likely first. */
  claudeProjects: string[];
}

/**
 * Claude Code keeps its OAuth credentials in `~/.claude/.credentials.json` on
 * every platform it supports, including Windows, where `homedir()` resolves to
 * the user profile. `CLAUDE_CONFIG_DIR` overrides the directory when set, so
 * portable installs keep working. Transcripts sit next to the credentials, and
 * some releases write them under `~/.config/claude` instead.
 */
export function circlePaths(context: PathEnvironment): CirclePaths {
  const override = context.env.CLAUDE_CONFIG_DIR;
  const configDir = override || join(context.home, ".claude");
  return {
    claudeCredentials: join(configDir, ".credentials.json"),
    claudeProjects: override
      ? [join(override, "projects")]
      : [join(context.home, ".claude", "projects"), join(context.home, ".config", "claude", "projects")]
  };
}

/** Path used inside a WSL distro, relative to that distro's home directory. */
export const WSL_CREDENTIALS_PATH = ".claude/.credentials.json";

/**
 * Transcript directories inside a WSL distro, reached from Windows through the
 * distro's UNC share. `\\wsl.localhost` is current; `\\wsl$` covers older builds.
 */
export function wslProjectRoots(distro: string, home: string): string[] {
  const segments = home.split("/").filter(Boolean);
  return ["\\\\wsl.localhost", "\\\\wsl$"].flatMap((share) => [
    win32.join(share, distro, ...segments, ".claude", "projects"),
    win32.join(share, distro, ...segments, ".config", "claude", "projects")
  ]);
}
