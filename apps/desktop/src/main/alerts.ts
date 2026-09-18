import type { MetricKey, Usage } from "../shared/types";

export interface Alert {
  key: MetricKey;
  threshold: number;
  percent: number;
}

/**
 * Fires once per threshold crossed upwards, and rearms when usage drops back
 * below it — so a window sitting at 91% does not notify on every refresh.
 */
export class ThresholdAlerts {
  private readonly notified = new Map<MetricKey, number>();

  evaluate(usage: Usage, thresholds: number[]): Alert[] {
    if (usage.state !== "ok") return [];
    const ascending = [...thresholds].sort((left, right) => left - right);
    const alerts: Alert[] = [];
    for (const window of usage.windows) {
      const previousHighest = this.notified.get(window.key) ?? 0;
      const crossed = ascending.filter((threshold) => window.percent >= threshold);
      const highest = crossed.length ? crossed[crossed.length - 1]! : 0;
      if (highest > previousHighest) alerts.push({ key: window.key, threshold: highest, percent: window.percent });
      this.notified.set(window.key, highest);
    }
    return alerts;
  }

  reset(): void {
    this.notified.clear();
  }
}
