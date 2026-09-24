import assert from "node:assert/strict";
import test from "node:test";
import { decodeWslOutput, makeWslShell } from "../main/wsl";

test("decodeWslOutput handles wsl.exe's UTF-16 listing and a distro's UTF-8", () => {
  assert.equal(decodeWslOutput(Buffer.from("Ubuntu\n", "utf16le")), "Ubuntu\n");
  assert.equal(decodeWslOutput(Buffer.from("Ubuntu\n", "utf8")), "Ubuntu\n");
  assert.equal(decodeWslOutput("already text"), "already text");
});

test("distros is empty away from Windows so no wsl.exe is ever spawned", async () => {
  let called = false;
  const shell = makeWslShell({ platform: "darwin", exec: async () => { called = true; return Buffer.alloc(0); } });
  assert.deepEqual(await shell.distros(), []);
  assert.equal(await shell.hasClaude("Ubuntu"), false);
  assert.equal(called, false);
});

test("distros parses and trims wsl.exe's quiet listing", async () => {
  const shell = makeWslShell({
    platform: "win32",
    exec: async () => Buffer.from("Ubuntu\r\n\r\nDebian\r\n", "utf16le")
  });
  assert.deepEqual(await shell.distros(), ["Ubuntu", "Debian"]);
});

test("a failing wsl.exe reports no distros instead of throwing", async () => {
  const shell = makeWslShell({ platform: "win32", exec: async () => { throw new Error("not installed"); } });
  assert.deepEqual(await shell.distros(), []);
  assert.equal(await shell.hasClaude("Ubuntu"), false);
});

test("hasClaude reads the probe script's output", async () => {
  const shell = makeWslShell({ platform: "win32", exec: async () => Buffer.from("claude\n", "utf8") });
  assert.equal(await shell.hasClaude("Ubuntu"), true);
});

test("readFile asks the distro for the credentials path", async () => {
  const seen: string[] = [];
  const shell = makeWslShell({
    platform: "win32",
    exec: async (_command, _args, options) => { seen.push(options?.input ?? ""); return Buffer.from("{}", "utf8"); }
  });
  assert.equal(await shell.readFile("Ubuntu", ".claude/.credentials.json"), "{}");
  assert.match(seen[0] ?? "", /\.claude\/\.credentials\.json/);
});

test("homeDir returns the distro's $HOME and rejects anything that isn't an absolute path", async () => {
  const answer = { value: "/home/ana\n" };
  const shell = makeWslShell({ platform: "win32", exec: async () => Buffer.from(answer.value, "utf8") });
  assert.equal(await shell.homeDir("Ubuntu"), "/home/ana");
  answer.value = "";
  assert.equal(await shell.homeDir("Ubuntu"), null);
  assert.equal(await makeWslShell({ platform: "linux" }).homeDir("Ubuntu"), null);
});
