import { useEffect, useCallback } from "react";
import { S, mono } from "../../styles/appStyles";
import { useI18n } from "../../i18n";
import { JsonFields, parseOutputJson } from "./JsonFields";

// 检测结果大图查看框：左边整张图（不裁切），右边模型输出 + 绿/黄/红评级。
// 交互照搬 single 模式的图片查看框：← → 切换、Esc 关闭；另加 1/2/3 快速打标，
// 批量复核时手不用离开键盘。
// 只在一条记录内部切换 —— 跨记录切会混进别的模版/模型，评级的语境就变了。

const RATING_STYLES = {
  green: { label: "chat.rateGood", dot: "#22c55e", border: "rgba(34,197,94,0.56)", soft: "rgba(34,197,94,0.18)", text: "#dcfce7" },
  yellow: { label: "chat.rateUnsure", dot: "#facc15", border: "rgba(250,204,21,0.6)", soft: "rgba(250,204,21,0.16)", text: "#fef9c3" },
  red: { label: "chat.rateBad", dot: "#ef4444", border: "rgba(239,68,68,0.55)", soft: "rgba(239,68,68,0.16)", text: "#fca5a5" },
};
const RATING_ORDER = ["green", "yellow", "red"];
const KEY_TO_RATING = { 1: "green", 2: "yellow", 3: "red" };

export function DetectImageViewer({ recordId, items, index, onIndexChange, onClose, onRateItem }) {
  const { t } = useI18n();
  const item = items[index] || null;
  const total = items.length;
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const goPrev = useCallback(() => {
    if (canPrev) onIndexChange(index - 1);
  }, [canPrev, index, onIndexChange]);
  const goNext = useCallback(() => {
    if (canNext) onIndexChange(index + 1);
  }, [canNext, index, onIndexChange]);

  // 再点一次同色 = 取消，和卡片上的按钮行为一致。
  const rate = useCallback(
    (rating) => {
      if (!item) return;
      onRateItem?.(recordId, item.id, item.rating === rating ? null : rating);
    },
    [item, onRateItem, recordId]
  );

  useEffect(() => {
    const onKey = (e) => {
      // 别抢输入框里的按键。
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); return; }
      if (KEY_TO_RATING[e.key]) { e.preventDefault(); rate(KEY_TO_RATING[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose, rate]);

  if (!item) return null;

  const status = item.status || "done";
  const outputText =
    status === "loading" ? t("chat.thinking") : status === "error" ? item.error || t("chat.error") : item.outputText || "";
  const outputJson = status === "done" ? parseOutputJson(outputText) : null;
  const rating = RATING_STYLES[item.rating] ? item.rating : null;

  const navBtn = (enabled) => ({
    ...S.turnActionBtn,
    width: 44,
    height: 44,
    borderRadius: 22,
    fontSize: 20,
    padding: 0,
    flexShrink: 0,
    opacity: enabled ? 1 : 0.25,
    cursor: enabled ? "pointer" : "default",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={!canPrev} style={navBtn(canPrev)}>‹</button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          width: "min(1280px, 100%)",
          height: "min(86vh, 900px)",
          background: "#0b0b0d",
          border: `1px solid ${rating ? RATING_STYLES[rating].border : "rgba(255,255,255,0.12)"}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* 图：contain，完整显示，不裁切 */}
        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#050506", position: "relative" }}>
          <img src={item.image} alt="input" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
          <span style={{ position: "absolute", top: 12, left: 12, fontFamily: mono, fontSize: 12, color: "#a1a1aa", background: "rgba(0,0,0,0.55)", padding: "3px 8px", borderRadius: 6 }}>
            {index + 1} / {total}
          </span>
        </div>

        {/* 侧栏：输出 + 评级 */}
        <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 12px 0" }}>
            <button type="button" onClick={onClose} style={S.closeBtn}>✕</button>
          </div>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "6px 16px 16px",
              fontSize: 14,
              lineHeight: 1.5,
              color: status === "error" ? "#fca5a5" : "#e2e8f0",
              whiteSpace: outputJson ? "normal" : "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {outputJson ? <JsonFields data={outputJson} /> : outputText}
          </div>

          <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {RATING_ORDER.map((r, i) => {
                const st = RATING_STYLES[r];
                const active = rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    title={t(st.label)}
                    onClick={() => rate(r)}
                    style={{
                      ...S.turnActionBtn,
                      padding: "8px 4px",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      ...(active ? { borderColor: st.border, background: st.soft, color: st.text } : null),
                    }}
                  >
                    <span style={{ color: st.dot, fontSize: 14 }}>●</span>
                    <span style={{ fontFamily: mono, fontSize: 11, opacity: 0.7 }}>{i + 1}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#52525b", marginTop: 8, textAlign: "center" }}>
              {t("chat.viewerHint")}
            </div>
          </div>
        </div>
      </div>

      <button type="button" onClick={(e) => { e.stopPropagation(); goNext(); }} disabled={!canNext} style={navBtn(canNext)}>›</button>
    </div>
  );
}
