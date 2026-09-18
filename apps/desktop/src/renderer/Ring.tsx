import type { JSX } from "react";
import { clampPercent } from "../shared/types";

interface RingProps {
  size: number;
  percent: number;
  color: string;
  /** Stroke width in pixels. */
  thickness: number;
  /** Optional dimmer inner arc, drawn one ring in from the main one. */
  secondaryPercent?: number;
  secondaryColor?: string;
  trackOpacity?: number;
}

/** Progress ring starting at 12 o'clock and sweeping clockwise. */
export function Ring({ size, percent, color, thickness, secondaryPercent, secondaryColor, trackOpacity = 0.16 }: RingProps): JSX.Element {
  const outerRadius = (size - thickness) / 2;
  const outerLength = 2 * Math.PI * outerRadius;
  const innerThickness = Math.max(2, thickness * 0.45);
  const innerRadius = outerRadius - thickness / 2 - innerThickness / 2 - Math.max(2, thickness * 0.28);
  const innerLength = 2 * Math.PI * Math.max(innerRadius, 1);
  const outerFraction = clampPercent(percent) / 100;
  const innerFraction = clampPercent(secondaryPercent ?? 0) / 100;
  const center = size / 2;

  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle
          cx={center}
          cy={center}
          r={outerRadius}
          fill="none"
          stroke={color}
          strokeOpacity={trackOpacity}
          strokeWidth={thickness}
        />
        <circle
          className="ring-arc"
          cx={center}
          cy={center}
          r={outerRadius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${outerLength * outerFraction} ${outerLength}`}
        />
        {secondaryPercent !== undefined && innerRadius > innerThickness && (
          <circle
            className="ring-arc"
            cx={center}
            cy={center}
            r={innerRadius}
            fill="none"
            stroke={secondaryColor ?? color}
            strokeOpacity={0.5}
            strokeWidth={innerThickness}
            strokeLinecap="round"
            strokeDasharray={`${innerLength * innerFraction} ${innerLength}`}
          />
        )}
      </g>
    </svg>
  );
}
