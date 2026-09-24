import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { circlePaths, wslProjectRoots } from "../main/paths";

test("Windows credentials live under the user profile", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: {} });
  assert.match(paths.claudeCredentials, /\.claude[\\/]\.credentials\.json$/);
  assert.ok(paths.claudeCredentials.startsWith("C:\\Users\\ana"));
});

test("CLAUDE_CONFIG_DIR overrides the default directory", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: { CLAUDE_CONFIG_DIR: "D:\\claude" } });
  assert.match(paths.claudeCredentials, /^D:\\claude[\\/]\.credentials\.json$/);
});

test("transcripts are looked for in both of Claude Code's config directories", () => {
  const paths = circlePaths({ platform: "linux", home: "/home/ana", env: {} });
  assert.deepEqual(paths.claudeProjects, [join("/home/ana", ".claude", "projects"), join("/home/ana", ".config", "claude", "projects")]);
});

test("CLAUDE_CONFIG_DIR also moves the transcripts", () => {
  const paths = circlePaths({ platform: "linux", home: "/home/ana", env: { CLAUDE_CONFIG_DIR: "/opt/claude" } });
  assert.deepEqual(paths.claudeProjects, [join("/opt/claude", "projects")]);
});

test("WSL transcripts are reached through the distro's UNC share", () => {
  const roots = wslProjectRoots("Ubuntu", "/home/ana");
  assert.equal(roots[0], "\\\\wsl.localhost\\Ubuntu\\home\\ana\\.claude\\projects");
  assert.ok(roots.includes("\\\\wsl$\\Ubuntu\\home\\ana\\.claude\\projects"));
});
