import assert from "node:assert/strict";
import test from "node:test";
import { circlePaths, wslSharePath } from "../main/paths";

test("Windows credentials live under the user profile", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: {} });
  assert.match(paths.claudeCredentials, /\.claude[\\/]\.credentials\.json$/);
  assert.ok(paths.claudeCredentials.startsWith("C:\\Users\\ana"));
});

test("CLAUDE_CONFIG_DIR overrides the default directory", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: { CLAUDE_CONFIG_DIR: "D:\\claude" } });
  assert.match(paths.claudeCredentials, /^D:\\claude[\\/]\.credentials\.json$/);
});

test("transcripts sit next to the credentials, under projects/", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: { CLAUDE_CONFIG_DIR: "D:\\claude" } });
  assert.match(paths.claudeProjects, /^D:\\claude[\\/]projects$/);
});

test("wslSharePath reaches a distro's files through the \\\\wsl$ share", () => {
  assert.equal(wslSharePath("Ubuntu", "/home/ana/.claude/projects"), "\\\\wsl$\\Ubuntu\\home\\ana\\.claude\\projects");
});
