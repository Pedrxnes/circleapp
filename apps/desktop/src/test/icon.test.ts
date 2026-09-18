import assert from "node:assert/strict";
import test from "node:test";
import { renderAppIcon, renderOrbIcon } from "../shared/orb-icon";
import { encodePng } from "../shared/png";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("encodePng writes a signature, an IHDR with the right size and an IEND", () => {
  const png = encodePng(new Uint8Array(4 * 4 * 4), 4, 4);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 4);
  assert.equal(png.readUInt32BE(20), 4);
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");
});

test("encodePng rejects a buffer that does not match the requested size", () => {
  assert.throws(() => encodePng(new Uint8Array(10), 4, 4), /does not match/);
});

test("the tray mark renders at every size Circle asks for", () => {
  for (const size of [16, 32, 64]) {
    const png = renderOrbIcon({ size, percent: 55, color: "#d97757" });
    assert.ok(png.length > 0);
    assert.equal(png.readUInt32BE(16), size);
  }
});

test("a fuller ring paints more pixels than an empty one", () => {
  const empty = renderOrbIcon({ size: 64, percent: 0, color: "#ffffff" }).length;
  const full = renderOrbIcon({ size: 64, percent: 100, color: "#ffffff" }).length;
  assert.ok(full > empty, "a 100% arc should compress to more data than a 0% arc");
});

test("the app icon is a square PNG suitable for electron-builder", () => {
  const png = renderAppIcon(256);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
});
