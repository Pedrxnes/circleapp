import { encodePng } from "./png";
import { clampPercent } from "./types";

export interface Rgba { r: number; g: number; b: number; a: number; }

export function parseHex(hex: string, alpha = 1): Rgba {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  const value = match ? parseInt(match[1]!, 16) : 0xffffff;
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff, a: Math.round(Math.max(0, Math.min(1, alpha)) * 255) };
}

export interface OrbMarkOptions {
  /** Output edge length in pixels. Tray icons are rasterised at 2x for HiDPI. */
  size: number;
  percent: number;
  color: string;
  /** Dimmer arc drawn inside the main one; omit to draw a single ring. */
  secondaryPercent?: number;
  /** Filled disc behind the ring, e.g. the orb's plate. Omit for a bare ring. */
  discColor?: string;
  discAlpha?: number;
  /** Ring thickness as a fraction of the outer radius. */
  thickness?: number;
  /** Free space kept around the mark, as a fraction of the edge length. */
  inset?: number;
}

/** Alpha-composite `source` over the pixel at `index` (an RGBA byte offset). */
function blend(target: Uint8Array, index: number, source: Rgba, coverage: number): void {
  const alpha = (source.a / 255) * Math.max(0, Math.min(1, coverage));
  if (alpha <= 0) return;
  const existing = target[index + 3]! / 255;
  const out = alpha + existing * (1 - alpha);
  if (out <= 0) return;
  const channels = [source.r, source.g, source.b];
  for (let channel = 0; channel < 3; channel++) {
    target[index + channel] = Math.round((channels[channel]! * alpha + target[index + channel]! * existing * (1 - alpha)) / out);
  }
  target[index + 3] = Math.round(out * 255);
}

/** Signed-distance coverage for one pixel, giving cheap analytic antialiasing. */
function coverage(distance: number, edge: number): number {
  return Math.max(0, Math.min(1, 0.5 - (distance - edge)));
}

/** Rasterise the Circle mark into an existing RGBA buffer. */
export function rasterizeOrbMark(pixels: Uint8Array, options: OrbMarkOptions): void {
  const { size } = options;
  const center = size / 2;
  const outerRadius = size / 2 - size * (options.inset ?? 0.06);
  const thickness = Math.max(1.5, outerRadius * (options.thickness ?? 0.3));
  const ringRadius = outerRadius - thickness / 2;
  const sweep = (clampPercent(options.percent) / 100) * Math.PI * 2;
  const arc = parseHex(options.color);
  const track = parseHex(options.color, 0.22);
  const disc = options.discColor ? parseHex(options.discColor, options.discAlpha ?? 0.85) : null;
  const hasSecondary = options.secondaryPercent !== undefined;
  const secondary = parseHex(options.color, 0.45);
  const secondaryRadius = ringRadius - thickness * 1.15;
  const secondaryThickness = Math.max(1, thickness * 0.45);
  const secondarySweep = (clampPercent(options.secondaryPercent ?? 0) / 100) * Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const distance = Math.hypot(dx, dy);
      if (distance > outerRadius + 1) continue;

      if (disc) blend(pixels, index, disc, coverage(distance, outerRadius - thickness - 0.5));

      // Angle measured clockwise from 12 o'clock, in [0, 2*PI).
      const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);

      const ringCoverage = coverage(Math.abs(distance - ringRadius), thickness / 2);
      if (ringCoverage > 0) {
        blend(pixels, index, track, ringCoverage);
        if (options.percent > 0 && angle <= sweep) blend(pixels, index, arc, ringCoverage);
      }

      if (hasSecondary && secondaryRadius > secondaryThickness) {
        const innerCoverage = coverage(Math.abs(distance - secondaryRadius), secondaryThickness / 2);
        if (innerCoverage > 0 && (options.secondaryPercent ?? 0) > 0 && angle <= secondarySweep) {
          blend(pixels, index, secondary, innerCoverage);
        }
      }
    }
  }
}

/** Encode the mark on its own, with a transparent background. */
export function renderOrbIcon(options: OrbMarkOptions): Buffer {
  const pixels = new Uint8Array(options.size * options.size * 4);
  rasterizeOrbMark(pixels, options);
  return encodePng(pixels, options.size, options.size);
}

/** Product icon: the mark on an opaque round plate, for installers and the taskbar. */
export function renderAppIcon(size: number): Buffer {
  const pixels = new Uint8Array(size * size * 4);
  const center = size / 2;
  const plateRadius = size / 2 - size * 0.02;
  const plate = parseHex("#16181d", 1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      blend(pixels, (y * size + x) * 4, plate, coverage(distance, plateRadius));
    }
  }
  rasterizeOrbMark(pixels, { size, percent: 68, secondaryPercent: 34, color: "#d97757", thickness: 0.2, inset: 0.2 });
  return encodePng(pixels, size, size);
}
