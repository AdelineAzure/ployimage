// 评分在三个地方显示：历史卡片角标、图片详情评分面板、Eval tab。
// 用一个 context 共享，避免把分数一层层穿过 TurnPanel → ResultColumn → ImageCard。
import { createContext, useContext } from "react";
import { mono } from "../../styles/appStyles";

export const EvalScoreContext = createContext(null);

// 返回 { scoreFor(turnId, modelId, promptKey, index) => view | null, ... }，没有 Provider 时为 null。
export function useEvalScores() {
  return useContext(EvalScoreContext);
}

export const TONE_STYLES = {
  good: { bg: "rgba(22,163,74,0.92)", border: "rgba(134,239,172,0.7)", text: "#f0fdf4" },
  ok: { bg: "rgba(202,138,4,0.92)", border: "rgba(253,224,71,0.7)", text: "#fefce8" },
  bad: { bg: "rgba(220,38,38,0.94)", border: "rgba(252,165,165,0.75)", text: "#fef2f2" },
  pending: { bg: "rgba(180,83,9,0.9)", border: "rgba(253,186,116,0.6)", text: "#fff7ed" },
  none: { bg: "rgba(39,39,42,0.9)", border: "rgba(255,255,255,0.2)", text: "#e4e4e7" },
};

export function ScoreBadge({ view, compact = false, offsetTop = 8, onClick }) {
  if (!view) return null;
  const tone = TONE_STYLES[view.tone] || TONE_STYLES.none;
  const text = view.status === "keyFail"
    ? `${view.total ?? "—"} ✕`
    : view.status === "unjudged" || view.status === "partial"
    ? view.label
    : String(view.total ?? "—");
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onClick?.(); }}
      onMouseDown={(event) => event.preventDefault()}
      title={view.title}
      style={{
        position: "absolute",
        left: compact ? 4 : 8,
        top: offsetTop,
        zIndex: 4,
        minWidth: compact ? 30 : 38,
        height: compact ? 18 : 22,
        padding: compact ? "0 5px" : "0 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontFamily: mono,
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </button>
  );
}

// 低分图在卡片上加红框。
export function lowScoreFrame(view) {
  if (!view || view.tone !== "bad") return null;
  return { borderColor: "rgba(239,68,68,0.95)", boxShadow: "0 0 0 1px rgba(239,68,68,0.5) inset" };
}
