import { ORB_BOX_HEIGHT, ORB_BOX_PADDING, ORB_BOX_WIDTH } from "../shared/types";
import type { OrbLayout } from "../shared/types";

export interface Rect { x: number; y: number; width: number; height: number; }

export interface OrbPlacement {
  /** Bounds for the transparent window that hosts the orb and its hover panel. */
  bounds: Rect;
  layout: OrbLayout;
  /** The orb centre after clamping, in screen coordinates. */
  center: { x: number; y: number };
}

/**
 * Place the orb window so the orb sits at `center`.
 *
 * The orb itself is clamped to stay fully inside the work area, while the
 * transparent box around it is free to hang off the screen edge — that is what
 * lets the orb rest flush in a corner. The hover panel opens towards the middle
 * of the screen, so the box always extends inwards and has room to draw.
 */
export function computeLayout(center: { x: number; y: number }, area: Rect, diameter: number): OrbPlacement {
  const radius = diameter / 2;
  const clampedX = Math.round(Math.min(Math.max(center.x, area.x + radius), area.x + area.width - radius));
  const clampedY = Math.round(Math.min(Math.max(center.y, area.y + radius), area.y + area.height - radius));

  const anchor: OrbLayout["anchor"] = clampedX > area.x + area.width / 2 ? "right" : "left";
  const centerX = anchor === "right" ? ORB_BOX_WIDTH - ORB_BOX_PADDING - radius : ORB_BOX_PADDING + radius;

  const boxHeight = Math.min(ORB_BOX_HEIGHT, area.height);
  const boxY = Math.round(Math.min(Math.max(clampedY - boxHeight / 2, area.y), area.y + area.height - boxHeight));

  return {
    bounds: { x: Math.round(clampedX - centerX), y: boxY, width: ORB_BOX_WIDTH, height: boxHeight },
    layout: { boxWidth: ORB_BOX_WIDTH, boxHeight, orbDiameter: diameter, centerX, centerY: clampedY - boxY, anchor },
    center: { x: clampedX, y: clampedY }
  };
}
