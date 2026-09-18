import assert from "node:assert/strict";
import test from "node:test";
import { circlePaths } from "../main/paths";

test("Windows credentials live under the user profile", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: {} });
  assert.match(paths.claudeCredentials, /\.claude[\\/]\.credentials\.json$/);
  assert.ok(paths.claudeCredentials.startsWith("C:\\Users\\ana"));
});

test("CLAUDE_CONFIG_DIR overrides the default directory", () => {
  const paths = circlePaths({ platform: "win32", home: "C:\\Users\\ana", env: { CLAUDE_CONFIG_DIR: "D:\\claude" } });
  assert.match(paths.claudeCredentials, /^D:\\claude[\\/]\.credentials\.json$/);
});
