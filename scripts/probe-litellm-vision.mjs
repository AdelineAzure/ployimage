// 探针：确认 LiteLLM Business Relay 上哪些模型真能读图。只读，不改代码。
//
// 起因：飞书文档只说 gemma4 系列通过了「普通/流式翻译」验收，从没说它不能读图。
// 代码里的 vision:false 是推断出来的，这个脚本用来把推断换成实测。
//
// 用法: LITELLM_KEY=sk-xxx node scripts/probe-litellm-vision.mjs
//   可选 MODELS=a,b,c 覆盖默认待测清单
//   可选 BASE=... 覆盖中继地址（默认公网）

const KEY = process.env.LITELLM_KEY;
if (!KEY) { console.error("缺少 LITELLM_KEY"); process.exit(1); }

const BASE = process.env.BASE || "https://litellm-business-relay.vast-internal.com";

// 默认清单：4 个私有化部署模型（文档只验过翻译，读图能力未知）
// + 文档里明确点名能读图的几个，用来做对照 —— 如果对照组也失败，那是脚本或
// 网关的问题，不是被测模型的问题。
const DEFAULT_MODELS = [
  "gemma4-26b-a4b",
  "gemma4-12b-unified",
  "gemma4-e4b",
  "index-translate-35b-a3b",
  // 对照组：文档「模型选型」里图片理解的主选与备选
  "qwen3.7-flash",
  "gemini-2.5-flash",
  "gemini-3.6-flash",
  "deepseek-v4.1-flash-1017",
];
const MODELS = (process.env.MODELS || "").trim()
  ? process.env.MODELS.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_MODELS;

// 一张 8x8 纯红 PNG。问模型图里是什么颜色：
// 真读到图会说红；只把 base64 当文本吃掉的会跑题、胡猜或说看不见图。
const RED_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX/AAD//" +
  "/+l2Z/dAAAASUVORK5CYII=";
const DATA_URL = `data:image/png;base64,${RED_PNG}`;

async function listModels() {
  try {
    const resp = await fetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const data = await resp.json();
    return { ids: (data?.data || []).map((m) => m.id).sort() };
  } catch (err) {
    return { error: err.message };
  }
}

async function probe(model) {
  const body = {
    model,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What color is this image? Answer with one word." },
          { type: "image_url", image_url: { url: DATA_URL } },
        ],
      },
    ],
  };
  try {
    const resp = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      // 400 带 image/multimodal 字样 = 明确不收图；其它错误另说（可能是没这个模型）。
      const noVision = /image|multimodal|vision|content.*type|not support/i.test(text);
      return {
        verdict: noVision ? "拒收图片" : "报错",
        detail: `HTTP ${resp.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`,
      };
    }
    const out = JSON.parse(text)?.choices?.[0]?.message?.content ?? "";
    const said = typeof out === "string" ? out : JSON.stringify(out);
    // 说对颜色才算真读到图。说不出颜色不等于不能读图（可能只是答歪），
    // 所以这里只报原话，结论留给人看。
    const sawRed = /\bred\b|红/i.test(said);
    return {
      verdict: sawRed ? "读到图 ✅" : "有回复但没说对颜色 ⚠️",
      detail: said.slice(0, 160).replace(/\s+/g, " "),
    };
  } catch (err) {
    return { verdict: "请求失败", detail: err.message };
  }
}

const listed = await listModels();
if (listed.error) {
  console.log(`/v1/models 读取失败: ${listed.error}（继续逐个试)\n`);
} else {
  console.log(`网关上报 ${listed.ids.length} 个模型。\n`);
}

for (const model of MODELS) {
  const known = listed.ids ? (listed.ids.includes(model) ? "" : "（未在 /v1/models 中）") : "";
  const { verdict, detail } = await probe(model);
  console.log(`${model}${known}\n  → ${verdict}\n  ${detail}\n`);
}

if (listed.ids) {
  const untested = listed.ids.filter((id) => !MODELS.includes(id));
  if (untested.length) console.log(`网关上还有未测模型:\n  ${untested.join("\n  ")}`);
}
