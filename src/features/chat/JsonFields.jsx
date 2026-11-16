import { mono } from "../../styles/appStyles";
import { parseJsonFromText } from "../../services/appCore";

// 模型输出若是 JSON（含 ```json 围栏），按字段渲染成「键：值」，不再显示原始的大括号和引号。
// 只认对象（{...}）：纯数字/字符串/数组也能被 JSON.parse 吃下，但那种情况原文本身就够清楚。
// 解析不出来就返回 null，调用方原样显示文本 —— 绝不吞掉模型的原始输出。
export function parseOutputJson(text) {
  if (typeof text !== "string" || !text.includes("{")) return null;
  const parsed = parseJsonFromText(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function JsonValue({ value }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span style={{ color: "#52525b" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
        {value.map((v, i) => (
          <span
            key={i}
            style={{
              padding: "1px 6px",
              borderRadius: 6,
              background: "rgba(250,204,21,0.10)",
              border: "1px solid rgba(250,204,21,0.28)",
              color: "#fde68a",
              overflowWrap: "anywhere",
              maxWidth: "100%",
            }}
          >
            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
          </span>
        ))}
      </span>
    );
  }
  if (value && typeof value === "object") {
    return <JsonFields data={value} nested />;
  }
  if (value === null || value === "") return <span style={{ color: "#52525b" }}>—</span>;
  if (typeof value === "boolean") {
    return <span style={{ color: value ? "#86efac" : "#fca5a5" }}>{String(value)}</span>;
  }
  return <span>{String(value)}</span>;
}

export function JsonFields({ data, nested = false }) {
  const entries = Object.entries(data || {});
  if (!entries.length) return <span style={{ color: "#52525b" }}>{"{}"}</span>;
  // 键在上、值在下：卡片只有约 1/6 屏宽，左右两列会把值挤成一字一行。
  // 两者都允许换行，长键、长值都不会撑破卡片。
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        ...(nested ? { paddingLeft: 8, borderLeft: "1px solid rgba(255,255,255,0.08)" } : null),
      }}
    >
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontFamily: mono, fontSize: "0.9em", color: "#a1a1aa", overflowWrap: "anywhere" }}>{k}</span>
          <span style={{ color: "#e2e8f0", overflowWrap: "anywhere", lineHeight: 1.45 }}>
            <JsonValue value={v} />
          </span>
        </div>
      ))}
    </div>
  );
}
