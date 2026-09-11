import { useState, useEffect, useRef } from "react";
import { S, mono } from "../../styles/appStyles";
import { useI18n, formatUiDateTime } from "../../i18n";
import { PromptTextWithChips } from "../workspace/promptControls";
import { buildDetectionExport } from "../../services/appCore";

const RATING_RED = "#ef4444";
const RATING_RED_SOFT = "rgba(239,68,68,0.16)";
const RATING_RED_BORDER = "rgba(239,68,68,0.55)";
const EMERALD = "#22c55e";
const EMERALD_BORDER = "rgba(34,197,94,0.56)";
const EMERALD_SOFT = "rgba(34,197,94,0.18)";
const EMERALD_TEXT = "#dcfce7";
// 契约未兑现（模型没按约定输出比对字段）用琥珀色单独标出，绝不能算红：
// 判红会把「模版写错了」混进错误率，而落成普通待判又跟「人还没看」视觉上无法区分。
// 剪贴板：优先 navigator.clipboard，不可用时退回隐藏 textarea + execCommand。
function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      ok ? resolve() : reject(new Error("copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

const AMBER = "#f59e0b";
const AMBER_BORDER = "rgba(245,158,11,0.55)";

// 单个「图片+输出」小组：图上标红/绿角标，下面是输出文字，边框随评级变色。
function ChatItemGroup({ recordId, item, resultField, onRateItem, onRerunItem }) {
  const { t } = useI18n();
  const rating = item?.rating === "red" || item?.rating === "green" ? item.rating : null;
  const status = item?.status || "done";
  const image = typeof item?.image === "string" && item.image ? item.image : "";
  // 文本小组：待检测文本顶掉缩略图的位置，下面多一行「期望 / 实际」对照。
  const caseText = typeof item?.text === "string" && item.text ? item.text : "";
  // note 只用于显示（多语言用例的中文译文/备注），不参与请求也不参与判定。
  const caseNote = typeof item?.note === "string" && item.note ? item.note : "";
  const expected = typeof item?.expected === "string" ? item.expected : "";
  const resultValue = typeof item?.resultValue === "string" ? item.resultValue : "";
  const parseFailed = item?.parseFailed === true && status === "done";
  // 逐字段对照结果（judgeDetectionOutput 产出）。老记录没有这个字段，退回单字段展示。
  const fields = Array.isArray(item?.fields) && item.fields.length
    ? item.fields
    : expected && typeof expected === "string" && status === "done"
    ? [{ key: resultField, expected, actual: resultValue, judged: true, match: rating ? rating === "green" : null }]
    : [];
  const judgedFieldNames = fields.filter((f) => f.judged).map((f) => f.key).join(", ");

  const groupBorder =
    rating === "red"
      ? { borderColor: RATING_RED, boxShadow: "0 0 0 1px rgba(239,68,68,0.35) inset" }
      : rating === "green"
      ? { borderColor: EMERALD_BORDER, boxShadow: "0 0 0 1px rgba(34,197,94,0.28) inset" }
      : parseFailed
      ? { borderColor: AMBER_BORDER, boxShadow: "0 0 0 1px rgba(245,158,11,0.28) inset" }
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
      ) : caseText ? (
        <div style={{ position: "relative" }}>
          <div
            title={caseText}
            style={{
              borderRadius: 8,
              background: "#0b0b0d",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "8px 8px 8px 24px",
              fontFamily: mono,
              fontSize: 10,
              lineHeight: 1.45,
              color: "#c4c4cc",
              maxHeight: 88,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {caseText}
          </div>
          {caseNote ? (
            <div
              title={caseNote}
              style={{
                marginTop: 3,
                padding: "3px 6px",
                borderRadius: 5,
                background: "rgba(125,211,252,0.07)",
                borderLeft: "2px solid rgba(125,211,252,0.45)",
                fontSize: 10,
                lineHeight: 1.4,
                color: "#9fc7de",
                maxHeight: 44,
                overflow: "auto",
                wordBreak: "break-word",
              }}
            >
              {caseNote}
            </div>
          ) : null}
          {rating || parseFailed ? (
            <span
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: rating === "red" ? RATING_RED : rating === "green" ? EMERALD : AMBER,
                boxShadow: "0 0 0 2px rgba(0,0,0,0.45)",
              }}
            />
          ) : null}
        </div>
      ) : null}

      {/* 逐字段对照。严格相等下「是。」和「是」会判失败，只给一个红点用户没法定位，
          所以每个字段的期望和实际都要显示。判定字段标 ✓，其余灰着只供肉眼扫。 */}
      {caseText && fields.length && status === "done" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            padding: "5px 7px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            fontFamily: mono,
            fontSize: 10,
            lineHeight: 1.4,
          }}
        >
          {fields.map((f) => {
            const ok = f.match === true;
            const bad = f.match === false;
            return (
              <div key={f.key} style={{ wordBreak: "break-word" }}>
                <span style={{ color: f.judged ? "#a1a1aa" : "#52525b" }}>
                  {f.key}
                  {f.judged ? " ✓" : ""}
                </span>
                <span style={{ color: "#52525b" }}>: </span>
                <span style={{ color: ok ? EMERALD_TEXT : bad ? "#fca5a5" : "#c4c4cc" }}>
                  {f.actual || "—"}
                </span>
                {/* 只在判错时并排显示期望值：判对时再重复一遍是噪声。
                    多解字段要把全部可接受值列出来 —— 否则看不出「是漏了一个选项」
                    还是「这个字段本来就只有一个答案」。 */}
                {bad ? (
                  <span style={{ color: "#71717a" }}> ≠ {f.expected}</span>
                ) : ok && f.accepts > 1 ? (
                  // 判对且是多解：标出接受几个值，避免误以为这是唯一正确答案。
                  <span style={{ color: "#52525b" }}> ({f.accepts})</span>
                ) : null}
              </div>
            );
          })}
          {parseFailed ? (
            <div style={{ color: AMBER, wordBreak: "break-word" }}>
              {t("detect.contractError", { field: judgedFieldNames || resultField })}
            </div>
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
            ) : caseText ? (
              <div
                style={{
                  ...S.viewerInfoPromptText,
                  maxHeight: 140,
                  marginBottom: 12,
                  flexShrink: 0,
                  fontSize: 12,
                  color: "#c4c4cc",
                }}
              >
                {caseText}
                {caseNote ? (
                  <div style={{ marginTop: 8, color: "#9fc7de", fontSize: 11 }}>{caseNote}</div>
                ) : null}
              </div>
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
  const textItemCount = items.filter((it) => typeof it?.text === "string" && it.text).length;
  const [copiedKind, setCopiedKind] = useState("");
  // 导出「用户输入 + 模型输出」JSON 到剪贴板，供丢给 AI 分析。
  const exportToClipboard = (onlyWrong) => {
    const payload = buildDetectionExport(record, { onlyWrong });
    copyTextToClipboard(JSON.stringify(payload, null, 2))
      .then(() => {
        setCopiedKind(onlyWrong ? "wrong" : "all");
        setTimeout(() => setCopiedKind(""), 1800);
      })
      .catch(() => {
        setCopiedKind("failed");
        setTimeout(() => setCopiedKind(""), 1800);
      });
  };
  // 文本记录排 6 列，图片记录保持缩略图能看清的宽度。
  const hasTextItems = items.some((it) => typeof it?.text === "string" && it.text);

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
          {/* 导出仅在有文本用例时出现：图片小组的输入是 base64，导出无意义。 */}
          {textItemCount > 0 ? (
            <>
              <button
                type="button"
                title={t("detect.exportAllHint")}
                onClick={() => exportToClipboard(false)}
                style={S.turnActionBtn}
              >
                {copiedKind === "all" ? t("detect.copied") : t("detect.exportAll", { count: textItemCount })}
              </button>
              {redCount > 0 ? (
                <button
                  type="button"
                  title={t("detect.exportWrongHint")}
                  onClick={() => exportToClipboard(true)}
                  style={{ ...S.turnActionBtn, borderColor: RATING_RED_BORDER, color: "#fca5a5" }}
                >
                  {copiedKind === "wrong" ? t("detect.copied") : t("detect.exportWrong", { count: redCount })}
                </button>
              ) : null}
            </>
          ) : null}
          {copiedKind === "failed" ? (
            <span style={{ fontSize: 11, color: "#fca5a5" }}>{t("detect.copyFailed")}</span>
          ) : null}
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

      {/* 输入+输出小组：网格排布。
          文本小组固定一行 6 个（文字比缩略图窄，装得下更多，扫一屏能看更多条）；
          图片小组保持原来的 auto-fill，缩略图挤到 1/6 宽就看不清了。
          minmax 的下限用 0 而不是 130px：固定 6 列时下限过大会在窄屏溢出。 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasTextItems
            ? "repeat(6, minmax(0, 1fr))"
            : "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {items.map((item) => (
          <ChatItemGroup
            key={item.id}
            recordId={record.id}
            item={item}
            resultField={record?.resultField || "result"}
            onRateItem={onRateItem}
            onRerunItem={onRerunItem}
          />
        ))}
      </div>
    </section>
  );
}
