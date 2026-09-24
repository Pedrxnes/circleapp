import { spawn } from "node:child_process";

const WSL_TIMEOUT_MS = 15_000;

export interface WslExec {
  (command: string, args: string[], options?: { input?: string }): Promise<Buffer>;
}

export interface WslShell {
  distros(): Promise<string[]>;
  hasClaude(distro: string): Promise<boolean>;
  readFile(distro: string, homeRelativePath: string): Promise<string>;
  /** The distro user's home directory, or null when it can't be asked. */
  home(distro: string): Promise<string | null>;
}

const PROBE_SCRIPT = 'if [ -e "$HOME/.claude/.credentials.json" ]; then echo claude; fi\ntrue\n';

/**
 * Claude Code on Windows is often installed inside WSL, which puts its
 * credentials on the distro's filesystem instead of the user profile. Circle
 * looks in both places and lets Settings pin the one to read.
 */
export function makeWslShell(options: { platform?: NodeJS.Platform; exec?: WslExec } = {}): WslShell {
  const platform = options.platform ?? process.platform;
  const exec = options.exec ?? wslExec;

  async function distros(): Promise<string[]> {
    if (platform !== "win32") return [];
    try {
      const output = decodeWslOutput(await exec("wsl.exe", ["--list", "--quiet"]));
      return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function hasClaude(distro: string): Promise<boolean> {
    if (platform !== "win32") return false;
    try {
      const output = decodeWslOutput(await exec("wsl.exe", ["-d", distro, "sh"], { input: PROBE_SCRIPT }));
      return output.split(/\r?\n/).some((line) => line.trim() === "claude");
    } catch {
      return false;
    }
  }

  async function readFile(distro: string, homeRelativePath: string): Promise<string> {
    return decodeWslOutput(await exec("wsl.exe", ["-d", distro, "sh"], { input: `cat "$HOME/${homeRelativePath}"\n` }));
  }

  async function home(distro: string): Promise<string | null> {
    if (platform !== "win32") return null;
    try {
      const output = decodeWslOutput(await exec("wsl.exe", ["-d", distro, "sh"], { input: 'echo "$HOME"\n' })).trim();
      return output.startsWith("/") ? output : null;
    } catch {
      return null;
    }
  }

  return { distros, hasClaude, readFile, home };
}

/**
 * `wsl.exe` prints UTF-16LE (with no BOM) when its own stdout is piped, while
 * commands run inside a distro return plain UTF-8. Detect which by looking for
 * interleaved NUL bytes rather than trusting the platform default.
 */
export function decodeWslOutput(output: Buffer | string): string {
  if (typeof output === "string") return output;
  const isUtf16 = output.length >= 4 && output[1] === 0 && output[3] === 0;
  return output.toString(isUtf16 ? "utf16le" : "utf8");
}

function wslExec(command: string, args: string[], options?: { input?: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const timer = setTimeout(() => { child.kill(); reject(new Error("The WSL command timed out.")); }, WSL_TIMEOUT_MS);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(decodeWslOutput(Buffer.concat(stderr)).trim() || `wsl.exe exited with code ${code}.`));
    });
    if (options?.input) child.stdin.write(options.input);
    child.stdin.end();
  });
}
