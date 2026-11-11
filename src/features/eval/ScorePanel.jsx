// 图片详情里的评分面板：和信息面板共用左侧 320px 停靠位，标签切换，一次只显示一个。
// 每条标准 0–3 四个格子，点一下就是人工改分；金色 = 你改过的条目。
import { S, mono } from "../../styles/appStyles";
import { useI18n } from "../../i18n";
import { SCORE_LEVELS } from "../../services/evalCore";
import { TONE_STYLES } from "./scoreContext";

const GOLD = "#facc15";
const GOLD_SOFT = "rgba(250,204,21,0.16)";
const LEVEL_TONE = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a"];

export function PanelTabs({ active, onChange, hasInfo, hasScore }) {
  const { t } = useI18n();
  if (!(hasInfo && hasScore)) return null;
  const tab = (key, label) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      style={{
        flex: 1,
        height: 28,
        borderRadius: 7,
        border: `1px solid ${active === key ? GOLD : "rgba(255,255,255,0.14)"}`,
        background: active === key ? GOLD_SOFT : "transparent",
        color: active === key ? GOLD : "#cbd5e1",
        fontFamily: mono,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {tab("info", `ⓘ ${t("eval.tabInfo")}`)}
      {tab("score", `★ ${t("eval.tabScore")}`)}
    </div>
  );
}

// view：scoreContext 给出的这张图的评分视图（见 App 里的 buildScoreView）。
export function ScorePanel({ view, onClose, onSetHuman, onRejudge, onEditCriteria, busy = false }) {
  const { t } = useI18n();
  if (!view) return null;
  const tone = TONE_STYLES[view.tone] || TONE_STYLES.none;
  return (
    <div style={{ ...S.viewerInfoPanelDocked, overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
      <div style={S.viewerInfoHeader}>
        <span style={S.viewerInfoTitle}>{t("eval.tabScore")}</span>
        <button type="button" style={S.viewerInfoClose} onClick={onClose} aria-label={t("common.close")}>✕</button>
      </div>

      {!view.inSet ? (
        <p style={{ fontFamily: mono, fontSize: 12, color: "#a1a1aa", lineHeight: 1.6, margin: "12px 0 0" }}>{t("eval.notInSet")}</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "10px 0 2px" }}>
            <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: tone.border, fontVariantNumeric: "tabular-nums" }}>
              {view.total ?? "—"}<span style={{ fontSize: 13, color: "#a1a1aa" }}> / 10</span>
            </span>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>{t("eval.passLine", { score: view.passScore })}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: view.status === "keyFail" ? "#fca5a5" : "#a1a1aa", marginBottom: 4 }}>
            {view.statusText}
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: "#71717a", marginBottom: 10 }}>
            <b style={{ color: "#e4e4e7" }}>{view.caseLabel || view.caseId}</b> · {view.setName}{view.judgeModel ? ` · ${view.judgeModel}` : ""}{view.gptTotal !== null && view.gptTotal !== view.total ? ` · ${t("eval.gptOriginal", { score: view.gptTotal })}` : ""}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {view.rows.map((row) => {
              const edited = row.human !== null;
              return (
                <div key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: edited ? GOLD : "#f1f5f9", minWidth: 0, lineHeight: 1.4 }} title={row.desc}>
                      {row.key ? "◆ " : ""}{row.desc || row.id}
                      <span style={{ color: "#71717a", fontFamily: mono, fontSize: 10 }}> ×{row.weight}</span>
                    </span>
                    <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
                      {SCORE_LEVELS.map((level) => {
                        const on = row.score === level;
                        return (
                          <button
                            key={level}
                            type="button"
                            disabled={busy}
                            onClick={() => onSetHuman(row.id, level === row.human ? null : level)}
                            title={t(`eval.level${level}`)}
                            style={{
                              width: 20, height: 20, borderRadius: 4, padding: 0,
                              border: `1px solid ${on ? (edited ? GOLD : LEVEL_TONE[level]) : "rgba(255,255,255,0.16)"}`,
                              background: on ? (edited ? GOLD_SOFT : LEVEL_TONE[level]) : "transparent",
                              color: on ? (edited ? GOLD : "#fff") : "#a1a1aa",
                              fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                            }}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                  {!!row.reason && <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4, lineHeight: 1.5 }}>{row.reason}</div>}
                  {edited && (
                    <div style={{ fontFamily: mono, fontSize: 10, color: GOLD, marginTop: 3 }}>
                      {t("eval.humanEdited", { score: row.gpt ?? "—" })}
                      {row.staleHuman ? ` · ${t("eval.oldCriteriaHuman")}` : ""}
                    </div>
                  )}
                  {row.stale && !edited && <div style={{ fontFamily: mono, fontSize: 10, color: "#fdba74", marginTop: 3 }}>{t("eval.staleItem")}</div>}
                </div>
              );
            })}
          </div>

          {view.inactiveCount > 0 && (
            <div style={{ fontFamily: mono, fontSize: 11, color: "#71717a", marginTop: 10 }} title={view.inactiveTitle}>
              {t("eval.inactiveCount", { count: view.inactiveCount })}
            </div>
          )}
          {!!view.tags.length && (
            <div style={{ fontFamily: mono, fontSize: 10, color: "#71717a", marginTop: 6 }}>{t("eval.tags")}: {view.tags.join(" · ")}</div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
            <button type="button" disabled={busy} onClick={onRejudge} style={{ ...panelBtn, flex: 1 }}>
              {busy ? t("eval.judging") : view.judged ? t("eval.rejudge") : t("eval.judgeThis")}
            </button>
            <button type="button" onClick={onEditCriteria} style={{ ...panelBtn, flex: 1 }}>{t("eval.editCriteria")} ↗</button>
          </div>
          {!!view.error && <div style={{ fontFamily: mono, fontSize: 11, color: "#fca5a5", marginTop: 8, lineHeight: 1.5 }}>{view.error}</div>}
          <p style={{ fontFamily: mono, fontSize: 10, color: "#71717a", lineHeight: 1.6, margin: "12px 0 0" }}>{t("eval.panelHint")}</p>
        </>
      )}
    </div>
  );
}

const panelBtn = {
  height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0", fontFamily: mono, fontSize: 11, cursor: "pointer",
};
