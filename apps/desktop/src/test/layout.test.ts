import assert from "node:assert/strict";
import test from "node:test";
import { computeLayout } from "../main/layout";
import { ORB_BOX_PADDING, ORB_BOX_WIDTH } from "../shared/types";

const area = { x: 0, y: 0, width: 1920, height: 1040 };

test("the panel opens inwards from whichever half the orb sits in", () => {
  assert.equal(computeLayout({ x: 1800, y: 500 }, area, 72).layout.anchor, "right");
  assert.equal(computeLayout({ x: 120, y: 500 }, area, 72).layout.anchor, "left");
});

test("the orb stays fully on screen while its transparent box may hang off", () => {
  const placement = computeLayout({ x: 5000, y: 5000 }, area, 72);
  assert.equal(placement.center.x, 1884);
  assert.equal(placement.center.y, 1004);
  // The box extends left of the orb, so it stays within the screen here.
  assert.equal(placement.bounds.x, 1884 - (ORB_BOX_WIDTH - ORB_BOX_PADDING - 36));
});

test("the box is clamped vertically so the hover panel is never drawn off screen", () => {
  const top = computeLayout({ x: 1800, y: 0 }, area, 72);
  assert.equal(top.bounds.y, area.y);
  assert.ok(top.layout.centerY >= 0 && top.layout.centerY <= top.layout.boxHeight);

  const bottom = computeLayout({ x: 1800, y: 5000 }, area, 72);
  assert.equal(bottom.bounds.y + bottom.layout.boxHeight, area.y + area.height);
});

test("the orb centre reported back matches where it is drawn in the box", () => {
  const placement = computeLayout({ x: 1400, y: 720 }, area, 92);
  assert.equal(placement.bounds.x + placement.layout.centerX, placement.center.x);
  assert.equal(placement.bounds.y + placement.layout.centerY, placement.center.y);
});

test("a work area shorter than the box still produces a valid placement", () => {
  const small = { x: 0, y: 0, width: 800, height: 200 };
  const placement = computeLayout({ x: 700, y: 100 }, small, 56);
  assert.equal(placement.layout.boxHeight, 200);
  assert.equal(placement.bounds.y, 0);
});

test("a second monitor's offset is preserved", () => {
  const secondary = { x: 1920, y: 0, width: 1280, height: 1024 };
  const placement = computeLayout({ x: 2000, y: 500 }, secondary, 72);
  assert.equal(placement.layout.anchor, "left");
  assert.equal(placement.center.x, 2000);
  assert.equal(placement.bounds.x, 2000 - (ORB_BOX_PADDING + 36));
});
