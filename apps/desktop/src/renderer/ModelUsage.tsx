import type { JSX } from "react";
import { strings } from "../shared/i18n";
import { modelColor, modelFamily, modelLabel } from "../shared/models";
import type { Language, ModelShare, ModelUsageSummary, ModelWindow } from "../shared/types";
import { formatPoints, formatSessionSpan, localeFor } from "./format";

interface ColoredShare extends ModelShare {
  color: string;
}

/** Family colours, lightened for the second and later model of a family in the same list. */
function colorize(models: ModelShare[]): ColoredShare[] {
  const seen = new Map<string, number>();
  return models.map((model) => {
    const family = modelFamily(model.model);
    const index = seen.get(family) ?? 0;
    seen.set(family, index + 1);
    return { ...model, color: modelColor(model.model, index) };
  });
}

/** A bar as wide as the limit, filled up to the window's usage and split between models. When the
 * window's percent is unknown the split fills the whole bar, and is drawn as shares only. */
function SplitBar({ window, models, language }: { window: ModelWindow; models: ColoredShare[]; language: Language }): JSX.Element {
  const shareOnly = window.percent === null;
  return (
    <div className={shareOnly ? "model-bar model-bar-share" : "model-bar"}>
      {models.map((model) => {
        const width = shareOnly ? model.share * 100 : model.percent ?? 0;
        if (width <= 0) return null;
        return (
          <span
            key={model.model}
            className="model-bar-part"
            style={{ width: `${width}%`, background: model.color }}
            title={`${modelLabel(model.model)} · ${shareText(model, language)}`}
          />
        );
      })}
    </div>
  );
}

function percentText(value: number, language: Language): string {
  return `≈${formatPoints(value, language)}%`;
}

function shareText(model: ModelShare, language: Language): string {
  const text = strings(language);
  const share = `${Math.round(model.share * 100)}% ${text.modelsOfUsage}`;
  return model.percent === null ? share : `${percentText(model.percent, language)} · ${share}`;
}

function WeekBreakdown({ window, language }: { window: ModelWindow; language: Language }): JSX.Element {
  const text = strings(language);
  const models = colorize(window.models);
  return (
    <div className="model-week">
      <div className="model-head">
        <span className="model-title">{text.modelsThisWeek}</span>
        {window.percent !== null && (
          <span className="model-total"><b>{Math.round(window.percent)}%</b> {text.used}</span>
        )}
      </div>
      {models.length > 0 ? (
        <>
          <SplitBar window={window} models={models} language={language} />
          <ul className="model-legend">
            {models.map((model) => (
              <li key={model.model} className="model-legend-row">
                <i style={{ background: model.color }} />
                <span className="model-name">{modelLabel(model.model)}</span>
                <span className="model-detail">
                  {model.percent !== null && (
                    <>
                      <b title={text.modelsEstimateExplain}>{percentText(model.percent, language)}</b> {text.modelsOfWeekLimit} ·{" "}
                    </>
                  )}
                  {Math.round(model.share * 100)}% {text.modelsOfUsage} · {model.replies.toLocaleString(localeFor(language))} {text.modelsReplies}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{text.modelsNoActivityWindow}</p>
      )}
    </div>
  );
}

function SessionRow({ window, language }: { window: ModelWindow; language: Language }): JSX.Element {
  const text = strings(language);
  const models = colorize(window.models);
  return (
    <li className="model-session">
      <div className="model-head">
        <span className="model-session-span">
          {formatSessionSpan(window.start, window.end, language)}
          {window.active && <span className="model-now">{text.modelsCurrent}</span>}
        </span>
        <span className="model-total" title={window.percent === null ? text.modelsNoPercent : undefined}>
          {window.percent === null ? "—" : <><b>{Math.round(window.percent)}%</b> {text.modelsOfSessionLimit}</>}
        </span>
      </div>
      {models.length > 0 ? (
        <>
          <SplitBar window={window} models={models} language={language} />
          <div className="model-chips">
            {models.map((model) => (
              <span key={model.model} className="model-chip" title={`${shareText(model, language)} · ${model.replies} ${text.modelsReplies}`}>
                <i style={{ background: model.color }} />
                {modelLabel(model.model)}
                <b>{model.percent === null ? `${Math.round(model.share * 100)}%` : percentText(model.percent, language)}</b>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted model-empty">{text.modelsNoActivityWindow}</p>
      )}
    </li>
  );
}

/** Which models spent the weekly and session limits, estimated from Claude Code's own logs. */
export function ModelUsage({ summary, language }: { summary: ModelUsageSummary; language: Language }): JSX.Element {
  const text = strings(language);
  if (!summary.logsFound) return <p className="muted model-empty">{text.modelsNoLogs}</p>;
  if (summary.week.models.length === 0 && summary.sessions.length === 0) {
    return <p className="muted model-empty">{text.modelsNoActivity}</p>;
  }
  return (
    <>
      <WeekBreakdown window={summary.week} language={language} />
      {summary.sessions.length > 0 && (
        <>
          <div className="model-sessions-title">{text.modelsSessions}</div>
          <ul className="model-sessions">
            {summary.sessions.map((window) => <SessionRow key={window.start} window={window} language={language} />)}
          </ul>
        </>
      )}
      <p className="muted">{text.modelsEstimateExplain}</p>
    </>
  );
}
