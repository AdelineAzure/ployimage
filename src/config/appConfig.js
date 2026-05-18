// ─── Model Registry ───
// Each model has its own apiType defining which upstream endpoint/format to use.
const SEEDREAM_MODELS = [
  // Seedream — /v1/images/generations (豆包生图)
  { id: "doubao-seedream-4-0-250828", name: "Seedream 4.0", shortName: "Seed 4.0", provider: "ByteDance", apiType: "images", platforms: ["deerapi"] },
  { id: "doubao-seedream-4-5-251128", name: "Seedream 4.5", shortName: "Seed 4.5", provider: "ByteDance", apiType: "images", badge: "NEW", platforms: ["deerapi"] },
  { id: "doubao-seedream-5-0-260128", name: "Seedream 5.0 Lite", shortName: "Seed 5", provider: "ByteDance", apiType: "images", badge: "NEW", platforms: ["deerapi"] },
];

const NANO_MODELS = [
  // NanoBanana 系列：本质调用 Gemini 图像模型
  { id: "gemini-2.5-flash-image", name: "NanoBanana", shortName: "Nano", provider: "Google", apiType: "gemini", badge: "HOT", platforms: ["deerapi"] },
  { id: "gemini-3.1-flash-image-preview", name: "NanoBanana 2", shortName: "Nano 2", provider: "Google", apiType: "gemini", badge: "NEW", platforms: ["deerapi"] },
  { id: "gemini-3-pro-image", name: "NanoBanana Pro", shortName: "Nano Pro", provider: "Google", apiType: "gemini", badge: "PRO", platforms: ["deerapi"] },
];

const MID_GPT_MODELS = [
  // Midjourney via /mj
  { id: "midjourney-imagine", name: "Midjourney Imagine", shortName: "Midjourney", provider: "Midjourney", apiType: "midjourney", badge: "BETA", platforms: ["deerapi"] },
  // GPT Image 系列 — 文生图走 /v1/images/generations；带输入图优先走 JSON 兼容路径，
  // gpt-image-1 / gpt-image-1-mini 才使用 /v1/images/edits (multipart)
  { id: "gpt-image-1.5", name: "GPT‑1.5 Image", shortName: "GPT-1.5", provider: "OpenAI", apiType: "images", badge: "HOT", platforms: ["deerapi"] },
  { id: "gpt-image-2", name: "GPT‑2 Image", shortName: "GPT-2", provider: "OpenAI", apiType: "images", badge: "NEW", platforms: ["deerapi"] },
];

const WAN_QWEN_MODELS = [
  // Bailian Wan 2.7 系列
  { id: "wan2.7-image", name: "wan", shortName: "wan", provider: "Alibaba", apiType: "bailian", badge: "NEW", platforms: ["bailian"] },
  { id: "wan2.7-image-pro", name: "wanpro", shortName: "wanpro", provider: "Alibaba", apiType: "bailian", badge: "PRO", platforms: ["bailian"] },
  // Bailian Qwen Image 系列：走 /api/v1/services/aigc/multimodal-generation/generation
  { id: "qwen-image-2.0", name: "qwen", shortName: "qwen", provider: "Alibaba", apiType: "bailian", badge: "NEW", platforms: ["bailian"] },
  { id: "qwen-image-2.0-pro", name: "qwen pro", shortName: "qwen pro", provider: "Alibaba", apiType: "bailian", badge: "PRO", platforms: ["bailian"] },
];

export const IMAGE_MODEL_ROWS = [
  SEEDREAM_MODELS,
  NANO_MODELS,
  MID_GPT_MODELS,
  WAN_QWEN_MODELS,
];
export const IMAGE_MODELS = IMAGE_MODEL_ROWS.flat();

export const PROVIDER_COLORS = {
  OpenAI: { bg: "#10a37f", text: "#fff" },
  Google: { bg: "#1a73e8", text: "#fff" },
  ByteDance: { bg: "#fe2c55", text: "#fff" },
  Midjourney: { bg: "#6d28d9", text: "#fff" },
  Alibaba: { bg: "#ff6a00", text: "#fff" },
};

export const LOCAL_STATE_KEY = "polyimage_local_state_v1";
export const DEFAULT_PROXY_URL = "https://img-proxy.adelineazures.workers.dev";
export const DEFAULT_SELECTED_MODELS = [
  "doubao-seedream-4-0-250828",
  "doubao-seedream-4-5-251128",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];
export const DEFAULT_MODEL_COUNTS = Object.fromEntries(IMAGE_MODELS.map((m) => [m.id, 1]));
export const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
export const ASPECT_RATIO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "21:9", label: "21:9" },
];
export const DEFAULT_TASK_MODE = "single";
export const DEFAULT_COMPARE_PROMPTS = { a: "", b: "" };
export const DEFAULT_LAST_EDITED_COUNT = 1;
export const DEFAULT_ASPECT_RATIO = "auto";
export const DEFAULT_API_PLATFORM = "deerapi";
export const DEFAULT_API_BASE_URLS = {
  deerapi: "https://api.deerapi.com",
  bailian: "https://dashscope.aliyuncs.com",
};
export const DEFAULT_API_BASE_URL = DEFAULT_API_BASE_URLS[DEFAULT_API_PLATFORM];
export const DEFAULT_API_KEY = "";
export const DEFAULT_API_KEYS = {
  deerapi: DEFAULT_API_KEY,
  bailian: DEFAULT_API_KEY,
};
export const DEFAULT_GPT_ASSIST_MODEL = "gpt-4o-mini";
export const DEFAULT_BAILIAN_ASSIST_MODEL = "qwen-plus";
export const DEFAULT_GPT_ASSIST_PROMPT = "你是一个提示词优化助手。你只改写 {{ }} 里的内容，保持用户原有写作风格、长度和随机感，不要改动大括号外的任何字符。";
export const DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT = true;
export const DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE = true;
export const DEFAULT_STYLE_THEME_ASSIST_PROMPT =
  "你是主题联想助手。用户会给你一个主题词，请输出12个可用于视觉创作的相关元素，要求具体、可见、彼此有区分。只输出JSON：{\"themes\":[\"...\", \"...\"]}，数组长度必须为12。";
export const PROMPT_EDITOR_MIN_HEIGHT = 104;
export const MAX_TEMPLATES = 12;
export const MAX_STYLE_TEMPLATES = 2;
export const STYLE_THEME_SLOTS = 12;
export const MAX_STYLE_REFERENCE_IMAGES = 4;
export const MAX_ATLAS_SELECTED_IMAGES = 20;
export const MAX_INPUT_IMAGES_PER_BATCH = 10;
export const INPUT_IMAGE_EDITOR_COLORS = ["#f8fafc", "#ef4444", "#f59e0b", "#22c55e", "#38bdf8", "#a855f7"];
export const MAX_SPLIT_EXPORT_ITEMS = 120;
export const MAX_CLUSTERED_SPLIT_ITEMS = 10;
export const SPLIT_SHAPE_MODE_ORDER = ["edge", "polygon", "rect"];
export const SPLIT_RENDER_MODE_ORDER = ["painted", "direct"];
export const SPLIT_GROUP_MODE_ORDER = ["standard", "cluster"];
export const DEFAULT_SPLIT_SHAPE_MODE = "edge";
export const DEFAULT_SPLIT_RENDER_MODE = "painted";
export const DEFAULT_SPLIT_GROUP_MODE = "standard";
export const DEFAULT_SPLIT_BG_COLOR = "#ffffff";
export const TEMPLATE_FILE_NAME = "templates.json";
export const STYLE_TEMPLATE_FILE_NAME = "style-templates.json";
export const GPT_ASSIST_FILE_NAME = "gpt-assist.json";
export const API_CONFIG_FILE_NAME = "api-config.json";
export const DEFAULT_TEMPLATES = Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
  id: `template-${index + 1}`,
  title: `Preset ${index + 1}`,
  body: "",
  backup: "",
  memo: "",
}));
export const DEFAULT_STYLE_TEMPLATES = Array.from({ length: MAX_STYLE_TEMPLATES }, (_, index) => ({
  id: `style-template-${index + 1}`,
  title: `Style ${index + 1}`,
  body: "",
}));
export const DEFAULT_STYLE_THEMES = Array.from({ length: STYLE_THEME_SLOTS }, () => "");
export const NANO_PRO_OFFICIAL_MODEL_ID = "gemini-3-pro-image";
export const NANO_PRO_LEGACY_MODEL_IDS = ["nano-banana-pro-all", "gemini-3-pro-preview"];
export const DEFAULT_UI_LANGUAGE = "en";
