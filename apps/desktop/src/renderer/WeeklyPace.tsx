import type { JSX } from "react";
import { strings } from "../shared/i18n";
import { EXPECTED_DAILY_POINTS, dayStatus, weeklyPace } from "../shared/pace";
import type { PaceStatus } from "../shared/pace";
import { SESSION_NEAR_LIMIT_PERCENT, dynamicColor, findWindow } from "../shared/types";
import type { HistorySummary, Language, Usage } from "../shared/types";
import { formatChange, formatDay, formatExhaustion, formatPaceDelta, formatPoints, formatReset, formatWeekday } from "./format";

/** Headroom above the tallest bar, and the least the scale may be, so the dashed target line always fits. */
const BAR_SCALE_FLOOR = EXPECTED_DAILY_POINTS * 1.25;

function Stat({ label, value, hint, tone, color, explain }: {
  label: string;
  value: string;
  hint: string;
  tone?: PaceStatus;
  color?: string;
  explain?: string;
}): JSX.Element {
  return (
    <div className="stat" title={explain}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` tone pace-${tone}` : ""}`} style={color ? { color } : undefined}>{value}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}

interface WeeklyPaceProps {
  usage: Usage;
  history: HistorySummary;
  language: Language;
}

/** Whether weekly usage is within what an even spread of the window predicts, what that pace
 * projects for the reset, and how the last seven days were actually used. */
export function WeeklyPace({ usage, history, language }: WeeklyPaceProps): JSX.Element {
  const text = strings(language);
  const pace = weeklyPace(usage, history.weekRatePerHour);
  const { weekly } = history;
  const resetsAt = findWindow(usage, "week")?.resetsAt ?? null;
  const today = weekly.days[weekly.days.length - 1]?.points ?? null;
  const hasDays = weekly.days.some((day) => day.points !== null);
  const scale = Math.max(BAR_SCALE_FLOOR, ...weekly.days.map((day) => (day.points ?? 0) * 1.1));
  const paceLabel = (status: PaceStatus): string =>
    status === "over" ? text.paceOver : status === "under" ? text.paceUnder : text.paceOn;
  const percentText = (value: number): string => `${formatPoints(value, language)}%`;

  return (
    <>
      {pace ? (
        <div className={`pace pace-${pace.status}`}>
          <div className="pace-head">
            <span className="pace-badge"><i />{paceLabel(pace.status)}</span>
            <span className="pace-delta">{formatPaceDelta(pace.delta, language)}</span>
          </div>
          <div className="pace-meter" title={text.paceMeterExplain}>
            <div className="pace-fill" style={{ width: `${pace.percent}%` }} />
            <div className="pace-marker" style={{ left: `${pace.expectedPercent}%` }} title={text.paceExpectedNow} />
          </div>
          <div className="pace-scale" title={text.paceMeterExplain}>
            <span><b>{Math.round(pace.percent)}%</b> {text.used}</span>
            <span><b>{Math.round(pace.expectedPercent)}%</b> {text.paceExpectedNow}</span>
          </div>
        </div>
      ) : (
        <p className="muted pace-unavailable">{text.paceUnavailable}</p>
      )}

      <div className="stats">
        {pace && (
          <>
            <Stat
              label={text.projectedAtReset}
              value={pace.projectedAtReset === null ? "—" : `~${Math.round(pace.projectedAtReset)}%`}
              color={pace.projectedAtReset === null ? undefined : dynamicColor(pace.projectedAtReset)}
              hint={pace.projectedAtReset === null
                ? text.needsMoreReadings
                : pace.projectedAtReset >= 100 && history.projectedWeekExhaustion
                  ? formatExhaustion(history.projectedWeekExhaustion, language)
                  : formatReset(resetsAt, language)}
              explain={text.projectedAtResetExplain}
            />
            <Stat
              label={pace.hoursToReset >= 24 ? text.dailyBudget : text.budgetUntilReset}
              value={percentText(pace.dailyBudget)}
              hint={pace.hoursToReset >= 24 ? text.dailyBudgetHint : formatReset(resetsAt, language)}
              explain={pace.hoursToReset >= 24 ? text.dailyBudgetExplain : text.budgetUntilResetExplain}
            />
          </>
        )}
        <Stat
          label={text.today}
          value={today === null ? "—" : percentText(today)}
          tone={today === null ? undefined : dayStatus(today)}
          hint={`${text.ofWord} ~${Math.round(EXPECTED_DAILY_POINTS)}% ${text.expectedPerDay}`}
          explain={text.todayExplain}
        />
        <Stat
          label={text.dailyAverage}
          value={weekly.dailyAverage === null ? "—" : percentText(weekly.dailyAverage)}
          tone={weekly.dailyAverage === null ? undefined : dayStatus(weekly.dailyAverage)}
          hint={weekly.changeVsPreviousWeek === null
            ? text.completeDaysHint
            : `${formatChange(weekly.changeVsPreviousWeek)} ${text.vsPreviousWeek}`}
          explain={text.dailyAverageExplain}
        />
      </div>

      {hasDays ? (
        <div className="daybars-wrap">
          <div className="daybars-head">
            <span>{text.dailyUsageTitle}</span>
            <span className="daybars-legend"><i />{text.expectedLine} (~{Math.round(EXPECTED_DAILY_POINTS)}%)</span>
          </div>
          <div className="daybars">
            {weekly.days.map((day) => (
              <span key={`value-${day.day}`} className="daybar-value">{day.points === null ? "—" : percentText(day.points)}</span>
            ))}
            <div className="daybars-plot">
              <div className="daybars-target" style={{ bottom: `${(EXPECTED_DAILY_POINTS / scale) * 100}%` }} />
              {weekly.days.map((day) => (
                <div
                  key={`bar-${day.day}`}
                  className="daybar-track"
                  title={`${formatDay(day.day, language)} · ${day.points === null ? text.noReadings : percentText(day.points)}`}
                >
                  {day.points !== null && day.points > 0 && (
                    <div
                      className={`daybar-fill pace-${dayStatus(day.points)}`}
                      style={{ height: `${Math.max(3, (day.points / scale) * 100)}%` }}
                    />
                  )}
                </div>
              ))}
            </div>
            {weekly.days.map((day, index) => (
              <span
                key={`label-${day.day}`}
                className={index === weekly.days.length - 1 ? "daybar-label daybar-today" : "daybar-label"}
              >
                {index === weekly.days.length - 1 ? text.today : formatWeekday(day.day, language)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">{text.noHistoryYet}</p>
      )}

      <p className="muted">
        {text.sessionsLastWeek}: <b>{weekly.sessionsStarted}</b> · <b>{weekly.sessionsNearLimit}</b> {text.sessionsNearLimit} (≥ {SESSION_NEAR_LIMIT_PERCENT}%)
      </p>
    </>
  );
}
