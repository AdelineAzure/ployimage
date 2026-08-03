import { useState, useEffect, useRef } from "react";
import { S, mono } from "../../styles/appStyles";
import { useI18n, formatUiDateTime } from "../../i18n";
import { PromptTextWithChips } from "../workspace/promptControls";

const RATING_RED = "#ef4444";
const RATING_RED_SOFT = "rgba(239,68,68,0.16)";
const RATING_RED_BORDER = "rgba(239,68,68,0.55)";
const EMERALD = "#22c55e";
const EMERALD_BORDER = "rgba(34,197,94,0.56)";
const EMERALD_SOFT = "rgba(34,197,94,0.18)";
const EMERALD_TEXT = "#dcfce7";

// 单个「图片+输出」小组：图上标红/绿角标，下面是输出文字，边框随评级变色。
function ChatItemGroup({ recordId, item, onRateItem, onRerunItem }) {
  const { t } = useI18n();
  const rating = item?.rating === "red" || item?.rating === "green" ? item.rating : null;
  const status = item?.status || "done";
  const image = typeof item?.image === "string" && item.image ? item.image : "";

  const groupBorder =
    rating === "red"
      ? { borderColor: RATING_RED, boxShadow: "0 0 0 1px rgba(239,68,68,0.35) inset" }
      : rating === "green"
      ? { borderColor: EMERALD_BORDER, boxShadow: "0 0 0 1px rgba(34,197,94,0.28) inset" }
      : { borderColor: "rgba(255,255,255,0.08)" };

  const outputText =
    status === "loading"
      ? t("chat.thinking")
      : status === "error"
      ? item?.error || t("chat.error")
      : item?.outputText || "";

  const [expanded, setExpanded] = useState(false);
  const outputRef = useRef(null);

  // 输出更新后自动滚到底部，检测结论一般在末尾，默认露出最后两行
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputText, status]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 6,
        borderRadius: 10,
        border: "1px solid transparent",
        background: "rgba(255,255,255,0.02)",
        ...groupBorder,
      }}
    >
      {image ? (
        <div style={{ position: "relative" }}>
          <img
            src={image}
            alt="input"
            style={{ width: "100%", borderRadius: 8, display: "block", background: "#0b0b0d", objectFit: "cover", aspectRatio: "1 / 1" }}
          />
          {rating ? (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: rating === "red" ? RATING_RED : EMERALD,
                boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div
        ref={outputRef}
        onClick={() => outputText && setExpanded(true)}
        title={outputText ? t("chat.expandOutput") : ""}
        style={{
          ...S.viewerInfoPromptText,
          minHeight: 48,
          maxHeight: 160,
          fontSize: 11,
          opacity: status === "error" ? 0.9 : 1,
          color: status === "error" ? "#fca5a5" : "#e2e8f0",
          cursor: outputText ? "pointer" : "default",
        }}
      >
        {outputText || (status === "loading" ? t("chat.thinking") : "")}
      </div>

      {expanded ? (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: 640,
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              background: "#0b0b0d",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            {image ? (
              <img
                src={image}
                alt="input"
                style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, marginBottom: 12, flexShrink: 0 }}
              />
            ) : null}
            <div
              style={{
                ...S.viewerInfoPromptText,
                maxHeight: "none",
                flex: 1,
                overflow: "auto",
                fontSize: 13,
                color: status === "error" ? "#fca5a5" : "#e2e8f0",
              }}
            >
              {outputText}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              style={{ ...S.turnActionBtn, marginTop: 12, alignSelf: "flex-end" }}
            >
              {t("chat.collapse")}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          title={t("chat.rateGood")}
          onClick={() => onRateItem?.(recordId, item.id, rating === "green" ? null : "green")}
          style={{
            ...S.turnActionBtn,
            flex: 1,
            padding: "2px 4px",
            fontSize: 12,
            ...(rating === "green"
              ? { borderColor: EMERALD_BORDER, background: EMERALD_SOFT, color: EMERALD_TEXT }
              : null),
          }}
        >
          <span style={{ color: EMERALD }}>●</span>
        </button>
        <button
          type="button"
          title={t("chat.rateBad")}
          onClick={() => onRateItem?.(recordId, item.id, rating === "red" ? null : "red")}
          style={{
            ...S.turnActionBtn,
            flex: 1,
            padding: "2px 4px",
            fontSize: 12,
            ...(rating === "red"
              ? { borderColor: RATING_RED_BORDER, background: RATING_RED_SOFT, color: "#fca5a5" }
              : null),
          }}
        >
          <span style={{ color: RATING_RED }}>●</span>
        </button>
        <button
          type="button"
          title={t("chat.rerun")}
          onClick={() => onRerunItem?.(recordId, item.id)}
          disabled={status === "loading"}
          style={{ ...S.turnActionBtn, flex: 1, padding: "2px 4px", fontSize: 12, opacity: status === "loading" ? 0.5 : 1 }}
        >
          ↻
        </button>
      </div>
    </div>
  );
}

// 单条检测记录卡片：顶部提示词（可折叠），下面按网格排「图片+输出」小组，尽量一行三组。
export function ChatMessageCard({ record, onRateItem, onRerunItem, onReuse, onDelete }) {
  const { uiLanguage, t } = useI18n();
  const [promptExpanded, setPromptExpanded] = useState(false);

  const items = Array.isArray(record?.items) ? record.items : [];

  const total = items.length;
  const redCount = items.filter((it) => it?.rating === "red").length;
  const errorRate = total > 0 ? Math.round((redCount / total) * 100) : 0;

  return (
    <section style={{ ...S.resultCol, border: "1px solid transparent", marginBottom: 16 }}>
      <div style={S.resultHeader}>
        <span
          style={{
            fontFamily: mono,
            fontSize: 12,
            color: "#a1a1aa",
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={`#${record?.seq || 0} · ${formatUiDateTime(record?.createdAt, uiLanguage)} · ${record?.model || ""}${record?.templateTitle ? ` · ${record.templateTitle}` : ""}`}
        >
          #{record?.seq || 0} · {formatUiDateTime(record?.createdAt, uiLanguage)} · {record?.model || ""}
          {record?.templateTitle ? ` · ${record.templateTitle}` : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            title={`${t("chat.errorRate")}: ${redCount}/${total}`}
            style={{
              fontFamily: mono,
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 11,
              border: `1px solid ${redCount > 0 ? RATING_RED_BORDER : "rgba(255,255,255,0.14)"}`,
              background: redCount > 0 ? RATING_RED_SOFT : "rgba(255,255,255,0.04)",
              color: redCount > 0 ? "#fca5a5" : "#a1a1aa",
              whiteSpace: "nowrap",
            }}
          >
            {t("chat.errorRate")} {errorRate}% ({redCount}/{total})
          </span>
          <button type="button" title={t("chat.reuse")} onClick={() => onReuse?.(record.id)} style={S.turnActionBtn}>
            {t("chat.reuse")}
          </button>
          <button
            type="button"
            title={t("chat.delete")}
            onClick={() => onDelete?.(record.id)}
            style={{ ...S.turnActionBtn, borderColor: RATING_RED_BORDER, color: "#fca5a5" }}
          >
            {t("chat.delete")}
          </button>
        </div>
      </div>

      {/* 提示词（检测指令）横排在顶部，默认折叠，可展开 */}
      {record?.prompt ? (
        <div
          style={{
            ...S.turnPromptCard,
            ...(promptExpanded ? null : S.turnPromptCardCompact),
            position: "relative",
            marginBottom: 12,
            cursor: "pointer",
          }}
          onClick={() => setPromptExpanded((v) => !v)}
          title={promptExpanded ? t("chat.collapse") : t("chat.expand")}
        >
          <div style={{ ...S.turnPromptText, ...(promptExpanded ? null : S.turnPromptTextCompact) }}>
            <PromptTextWithChips text={record.prompt} />
          </div>
        </div>
      ) : null}

      {/* 图片+输出小组：网格排布，尽量一行三组 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {items.map((item) => (
          <ChatItemGroup
            key={item.id}
            recordId={record.id}
            item={item}
            onRateItem={onRateItem}
            onRerunItem={onRerunItem}
          />
        ))}
      </div>
    </section>
  );
}
