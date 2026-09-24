import type { JSX } from "react";
import { strings } from "../shared/i18n";
import { modelColors, modelLabel } from "../shared/models";
import type { Language, ModelUsage, SessionModels } from "../shared/types";
import { formatPoints, formatTimeSpan, formatTokens } from "./format";

/** Models shown by name in the orb panel; the rest fold into "Others". */
const PANEL_MODELS = 3;

/** Every model in the window, in display order, mapped to its colour. */
export function colorsFor(models: SessionModels): Record<string, string> {
  return modelColors(models.models.map((model) => model.model));
}

export function shareText(share: number, language: Language): string {
  // A sliver of a percent still reads as "used", not as zero.
  return share > 0 && share < 0.1 ? "<0.1%" : `${formatPoints(share, language)}%`;
}

/** "Input 1.2k · Output 800 · Cache write 12k · Cache read 1.1M · 14 responses" */
export function tokenDetail(model: ModelUsage, language: Language): string {
  const text = strings(language);
  const tokens = (value: number): string => formatTokens(value, language);
  return [
    `${modelLabel(model.model)}: ${tokens(model.total)} ${text.tokensWord}`,
    `${text.tokenInput} ${tokens(model.input)}`,
    `${text.tokenOutput} ${tokens(model.output)}`,
    `${text.tokenCacheWrite} ${tokens(model.cacheWrite)}`,
    `${text.tokenCacheRead} ${tokens(model.cacheRead)}`,
    `${model.messages} ${text.responses}`
  ].join(" · ");
}

/** One bar split by model, each segment as wide as its share. */
export function ModelStack({ models, colors, language, thin }: {
  models: ModelUsage[];
  colors: Record<string, string>;
  language: Language;
  thin?: boolean;
}): JSX.Element {
  return (
    <div className={`model-stack${thin ? " model-stack-thin" : ""}`}>
      {models.map((model) => (
        <span
          key={model.model}
          style={{ width: `${model.share}%`, background: colors[model.model] }}
          title={`${modelLabel(model.model)} · ${shareText(model.share, language)}`}
        />
      ))}
    </div>
  );
}

/** Compact version for the orb's hover panel: the split bar and the top few models. */
export function PanelModels({ models, language }: { models: SessionModels; language: Language }): JSX.Element {
  const text = strings(language);
  const colors = colorsFor(models);
  const shown = models.models.slice(0, PANEL_MODELS);
  const rest = models.models.slice(PANEL_MODELS);
  const restShare = rest.reduce((sum, model) => sum + model.share, 0);

  return (
    <section className="panel-models">
      <div className="panel-models-head">
        <span className="panel-row-label">{text.modelsPanelTitle}</span>
        {models.total > 0 && <span className="panel-models-total">{formatTokens(models.total, language)} {text.tokensWord}</span>}
      </div>
      {models.total > 0 ? (
        <>
          <ModelStack models={models.models} colors={colors} language={language} />
          <ul className="panel-models-list">
            {shown.map((model) => (
              <li key={model.model}>
                <i style={{ background: colors[model.model] }} />
                <span className="panel-models-name">{modelLabel(model.model)}</span>
                <b>{shareText(model.share, language)}</b>
              </li>
            ))}
            {rest.length > 0 && (
              <li>
                <i className="panel-models-other" />
                <span className="panel-models-name">{text.otherModels}</span>
                <b>{shareText(restShare, language)}</b>
              </li>
            )}
          </ul>
        </>
      ) : (
        <span className="panel-models-empty">{text.modelsEmpty}</span>
      )}
    </section>
  );
}

/** Settings view: every model with its share and token counts, then each conversation's split. */
export function ModelBreakdown({ models, language }: { models: SessionModels | null; language: Language }): JSX.Element {
  const text = strings(language);
  if (!models) return <p className="muted">{text.modelsUnavailable}</p>;
  if (models.total === 0) return <p className="muted">{text.modelsEmpty}</p>;
  const colors = colorsFor(models);

  return (
    <>
      <ModelStack models={models.models} colors={colors} language={language} />
      <div className="model-table">
        {models.models.map((model) => (
          <div key={model.model} className="model-row" title={tokenDetail(model, language)}>
            <span className="model-name"><i style={{ background: colors[model.model] }} />{modelLabel(model.model)}</span>
            <div className="model-bar"><span style={{ width: `${Math.max(1, model.share)}%`, background: colors[model.model] }} /></div>
            <span className="model-share">{shareText(model.share, language)}</span>
            <span className="model-tokens">{formatTokens(model.total, language)}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        {formatTokens(models.total, language)} {text.tokensWord} · {formatTimeSpan(models.windowStart, models.windowEnd, language)}
      </p>

      {models.conversations.length > 0 && (
        <div className="conversations">
          <div className="conversations-head">{text.conversationsTitle}</div>
          {models.conversations.map((conversation) => (
            <article key={conversation.sessionId} className="conversation" title={conversation.sessionId}>
              <div className="conversation-head">
                <span className="conversation-project">{conversation.project ?? text.unknownProject}</span>
                <span className="conversation-time">{formatTimeSpan(conversation.startedAt, conversation.lastActiveAt, language)}</span>
                <span className="conversation-total">
                  {formatTokens(conversation.total, language)} · <b>{shareText(conversation.share, language)}</b> {text.ofTokens}
                </span>
              </div>
              <ModelStack models={conversation.models} colors={colors} language={language} thin />
              <div className="conversation-models">
                {conversation.models.map((model) => (
                  <span key={model.model} className="model-chip" title={tokenDetail(model, language)}>
                    <i style={{ background: colors[model.model] }} />
                    {modelLabel(model.model)} <b>{shareText(model.share, language)}</b>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="muted">{text.modelsNote}</p>
    </>
  );
}
